import { defineConfig, type Plugin } from 'vitest/config';
import path from 'path';
import react from '@vitejs/plugin-react';

// Stub style imports (.scss/.css/...) with an empty module during tests.
// Components import their stylesheets for side effects; routing those through
// vite's CSS/sass pipeline can hang (sass-embedded "Timeout calling fetch"),
// and tests never assert on styles. Resolving them to an empty module bypasses
// the preprocessor entirely.
const stubStyles = {
  name: 'stub-styles',
  enforce: 'pre' as const,
  resolveId(id: string) {
    return /\.(css|scss|sass|less|styl)$/.test(id) ? '\0style-stub' : null;
  },
  load(id: string) {
    return id === '\0style-stub' ? 'export default {}' : null;
  }
};

// `./locales/en-US.json?faq` is served by a webpack loader in the app build
// (features/i18n/faq-split.js: only the FAQ articles). Vite has no such loader
// and chokes on the query, so resolve it to the plain file; faq.ts reduces the
// whole locale to the same shape.
const faqQuery: Plugin = {
  name: 'faq-locale-query',
  enforce: 'pre',
  resolveId(id, importer) {
    if (!id.endsWith('en-US.json?faq')) return null;
    return this.resolve(id.replace('?faq', ''), importer, { skipSelf: true });
  }
};

export default defineConfig({
  // cast: dual vite versions in the workspace make the Plugin types diverge
  plugins: [stubStyles as any, faqQuery, react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/specs/setup-any-spec.ts'],
    include: ['src/specs/**/*.spec.{ts,tsx}'],
    server: {
      deps: {
        inline: ['uuid']
      }
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        '.next/**',
        'src/specs/**',
        '**/*.spec.ts',
        '**/*.spec.tsx',
      ],
    },
    // Set timezone for tests
    env: {
      TZ: 'UTC',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@ui': path.resolve(__dirname, './src/features/ui'),
    },
  },
});
