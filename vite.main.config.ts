import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        'playwright',
        'playwright-core',
        'electron',
        /^playwright\/.*/,
        /^playwright-core\/.*/,
        /^chromium-bidi\/.*/,
        'path',
        'node:path',
        'child_process',
        'node:child_process',
        'fs',
        'node:fs',
        'os',
        'node:os',
      ],
    },
  },
});
