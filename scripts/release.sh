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
NAME="$(node -p 'require("./src-tauri/tauri.conf.json").productName')"
TAG="v$VERSION"
echo "release: Glyph Arena $VERSION"

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  bash scripts/prepare-sidecar.sh
  npm ci --no-audit --no-fund >/dev/null
  # Only the .app, and signed but NOT notarized here: tauri's DMG step drives Finder
  # through AppleScript and times out on a Mac with no one at the screen, and its
  # notarize step gives up on a slow day at Apple with an empty error. We do both
  # ourselves below, where a slow answer is only a longer wait.
  env -u APPLE_API_KEY -u APPLE_API_ISSUER -u APPLE_API_KEY_PATH npx tauri build --bundles app
fi

APP="src-tauri/target/release/bundle/macos/Glyph Arena.app"

# Notarize: submit, then poll. `notarytool ... --wait` dies with "Bus error: 10"
# here (twice, on different builds) after the upload has already gone through, so
# the wait is ours: submit, read the id, ask for the status once a minute.
notarize() {  # notarize <file>
  local id
  id="$(xcrun notarytool submit "$1" --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER" \
        | sed -n 's/ *id: //p' | head -1)"
  [ -n "$id" ] || { echo "notarize: no submission id for $1" >&2; return 1; }
  echo "notarize: $1 -> $id"
  local s=""
  for _ in $(seq 1 60); do
    s="$(xcrun notarytool info "$id" --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER" 2>&1 | sed -n 's/ *status: //p' | head -1)"
    case "$s" in
      Accepted) return 0 ;;
      Invalid|Rejected) echo "notarize: Apple said $s for $id" >&2; return 1 ;;
    esac
    sleep 60
  done
  echo "notarize: still $s after an hour ($id)" >&2
  return 1
}

# The app itself. Already stapled: nothing to do.
if ! xcrun stapler validate "$APP" >/dev/null 2>&1; then
  ZIP="$(mktemp -d)/$NAME.zip"
  ditto -c -k --keepParent "$APP" "$ZIP"
  notarize "$ZIP"
  xcrun stapler staple "$APP"
  rm -rf "$(dirname "$ZIP")"
fi
DMG="src-tauri/target/release/bundle/dmg/${NAME}_${VERSION}_aarch64.dmg"
if [ "${SKIP_BUILD:-0}" != "1" ] || [ ! -f "$DMG" ]; then
  STAGE="$(mktemp -d)/$NAME"
  mkdir -p "$STAGE" "$(dirname "$DMG")"
  cp -R "$APP" "$STAGE/"
  ln -s /Applications "$STAGE/Applications"
  rm -f "$DMG"
  hdiutil create -volname "$NAME" -srcfolder "$STAGE" -ov -format UDZO "$DMG" >/dev/null
  rm -rf "$(dirname "$STAGE")"
  echo "release: $DMG"
fi
codesign --verify --deep --strict "$APP"
# Capture first: grep -q closing the pipe early would fail the step under pipefail.
SIDE="$(codesign -dvv "$APP/Contents/MacOS/arena-engine" 2>&1)"
[[ "$SIDE" == *"Authority=Developer ID Application"* ]] || { echo "sidecar is not Developer ID signed" >&2; exit 1; }
GK="$(spctl -a -vv "$APP" 2>&1)"; echo "$GK"
[[ "$GK" == *"Notarized Developer ID"* ]] || { echo "app is not notarized" >&2; exit 1; }

# The DMG itself: sign, notarize, staple, so the download opens without a warning.
codesign --force --sign "$APPLE_SIGNING_IDENTITY" --timestamp "$DMG"
notarize "$DMG"
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
