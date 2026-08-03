import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  css: { postcss: {} },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    alias: {
      // Absolute, because Vite resolves an alias target relative to the
      // importing file rather than the project root. As './src' this alias
      // never resolved, so no module importing '@/...' could be loaded in a
      // test at all, and vi.mock('@/...') silently matched nothing.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
