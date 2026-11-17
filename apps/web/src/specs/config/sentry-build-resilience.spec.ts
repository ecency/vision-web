import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A Sentry outage must not fail the deploy build (2026-11-17: the API answered
 * 503 to `sentry-cli releases new` and the staging image did not build).
 *
 * withSentryConfig hands `unstable_sentryWebpackPluginOptions` to the bundler
 * plugin; with an `errorHandler` its recoverable failures (release creation,
 * source map upload) are reported to the handler instead of thrown. The
 * plugin's file-deletion step is separate and still runs, so the source maps
 * that `productionBrowserSourceMaps` generates are removed either way.
 *
 * Read as text: requiring next.config.js would load the Sentry and Next
 * plugins, which this check does not need.
 */
const config = readFileSync(join(__dirname, "..", "..", "..", "next.config.js"), "utf8");

describe("the Sentry build step", () => {
  it("passes an error handler to the bundler plugin, so an upload failure is not fatal", () => {
    expect(config).toMatch(/unstable_sentryWebpackPluginOptions:\s*{\s*errorHandler:\s*\(err\)\s*=>/);
  });

  it("logs the failure rather than swallowing it", () => {
    expect(config).toMatch(/errorHandler:[\s\S]{0,120}console\.warn\(/);
  });

  it("still deletes source maps after upload", () => {
    expect(config).toMatch(/deleteSourcemapsAfterUpload:\s*true/);
  });
});
