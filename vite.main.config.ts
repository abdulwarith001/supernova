import { defineConfig } from "vite";

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        "playwright",
        "playwright-core",
        "electron",
        "ws",
        "bufferutil",
        "utf-8-validate",
        /^playwright\/.*/,
        /^playwright-core\/.*/,
        /^chromium-bidi\/.*/,
        "path",
        "node:path",
        "child_process",
        "node:child_process",
        "fs",
        "node:fs",
        "os",
        "node:os",
        "events",
        "node:events",
        "http",
        "node:http",
        "https",
        "node:https",
      ],
    },
  },
});
