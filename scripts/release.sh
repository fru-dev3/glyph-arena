#!/usr/bin/env bash
# Signed, notarized Glyph Arena release for Apple Silicon.
# Needs, in the environment (never in this repo):
#   APPLE_SIGNING_IDENTITY   "Developer ID Application: <name> (<team>)"
#   APPLE_API_KEY, APPLE_API_ISSUER, APPLE_API_KEY_PATH   an App Store Connect API key for notarytool
# Optional: ENGINE_DIR (local glyph-engine) or ENGINE_REF (default main); PUBLISH=1 to create the GitHub release.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${APPLE_SIGNING_IDENTITY:?}" "${APPLE_API_KEY:?}" "${APPLE_API_ISSUER:?}" "${APPLE_API_KEY_PATH:?}"
VERSION="$(node -p 'require("./src-tauri/tauri.conf.json").version')"
TAG="v$VERSION"
echo "release: Glyph Arena $VERSION"

bash scripts/prepare-sidecar.sh
npm ci --no-audit --no-fund >/dev/null
npx tauri build --bundles app,dmg

APP="src-tauri/target/release/bundle/macos/Glyph Arena.app"
DMG="$(ls src-tauri/target/release/bundle/dmg/*.dmg | head -1)"
codesign --verify --deep --strict "$APP"
codesign -dvv "$APP/Contents/MacOS/arena-engine" 2>&1 | grep -q "Authority=Developer ID Application" || { echo "sidecar is not Developer ID signed" >&2; exit 1; }
spctl -a -vv "$APP" 2>&1 | tee /dev/stderr | grep -q "Notarized Developer ID" || { echo "app is not notarized" >&2; exit 1; }

# The DMG itself: sign, notarize, staple, so the download opens without a warning.
codesign --force --sign "$APPLE_SIGNING_IDENTITY" --timestamp "$DMG"
xcrun notarytool submit "$DMG" --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER" --wait
xcrun stapler staple "$DMG"
spctl -a -t open --context context:primary-signature -vv "$DMG"

mkdir -p dist-release
cp "$DMG" "dist-release/Glyph-Arena_${VERSION}_aarch64.dmg"
cp "$DMG" "dist-release/Glyph-Arena-mac-arm64.dmg"
shasum -a 256 dist-release/*.dmg
if [ "${PUBLISH:-0}" = "1" ]; then
  [ -z "$(git ls-remote --tags origin "$TAG")" ] || { echo "tag $TAG already exists" >&2; exit 1; }
  gh release create "$TAG" dist-release/Glyph-Arena_${VERSION}_aarch64.dmg dist-release/Glyph-Arena-mac-arm64.dmg \
    --title "Glyph Arena $VERSION" --notes-file RELEASE_NOTES.md --target main
fi
