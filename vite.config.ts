import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1430, strictPort: true },
  build: { target: "safari16", sourcemap: false },
  // Only this app's own tests. A local engine checkout in .engine/ carries bun:test
  // files vitest cannot load, and they are not this app's suite anyway.
  test: { include: ["tests/**/*.test.ts"] },
});
