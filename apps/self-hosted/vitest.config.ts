import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  css: { postcss: {} },
  resolve: {
    alias: [
      // config.json is generated at image build and gitignored, so tests must
      // not depend on it existing. Mirrors the Dockerfile and CI build
      // fallback (config.template.json stands in). Matched against the RAW
      // specifier configuration-loader writes, because alias runs before
      // relative resolution; and top-level resolve.alias, not test.alias,
      // because the jsdom environment resolves through the client pipeline,
      // whose import analysis hard-fails on the missing file. Node-environment
      // tests survived without this only because the SSR pipeline
      // externalises the missing import and vi.mock intercepts it at runtime.
      {
        find: /^\.\.\/\.\.\/config\.json$/,
        replacement: fileURLToPath(
          new URL('./config.template.json', import.meta.url),
        ),
      },
    ],
  },
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
