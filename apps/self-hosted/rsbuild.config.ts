import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/rspack';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [pluginReact()],
  html: {
    // Custom template whose head carries an SSI marker: the serving nginx injects the
    // tenant's real <title>/description/OG tags there (see hosting/nginx-multi-tenant.conf
    // and ConfigService meta files), so link unfurls and crawlers see the blog's identity
    // instead of a build-tool default. The template keeps a fallback <title> for
    // deployments without SSI; do not set html.title here or it would replace it.
    template: './template.html',
  },
  resolve: {
    alias: {
      '@': './src',
    },
  },
  tools: {
    rspack: {
      resolve: {
        // Ensure React resolves to a single instance from the app's node_modules
        // This prevents multiple React instances when importing from workspace packages
        alias: {
          react: path.resolve(__dirname, 'node_modules/react'),
          'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
          '@tanstack/react-query': path.resolve(__dirname, 'node_modules/@tanstack/react-query'),
          '@ecency/ui': path.resolve(__dirname, '../../packages/ui/dist/index.js'),
          // hive-auth-wrapper imports Node's assert. Without this the bundler
          // resolves it to the npm polyfill, which reads process.emitWarning and
          // process.stderr at module scope, and Rspack provides no process
          // global: the chunk threw ReferenceError before any app code ran and
          // every hosted blog rendered blank. The shim keeps the one behaviour
          // the wrapper uses and drops the Node globals with the rest.
          assert: path.resolve(__dirname, 'src/shims/assert.ts'),
        },
      },
      plugins: [
        tanstackRouter({
          target: 'react',
          autoCodeSplitting: true,
        }),
      ],
    },
  },
});
