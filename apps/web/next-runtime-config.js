// Runtime config for `next start` in the production image.
//
// The image ships the build output but not next.config.js (that file pulls in
// build-only packages the pruned runtime node_modules does not carry). With no
// config file present, `next start` resolves every request-time option to
// Next's default: htmlLimitedBots, images, experimental flags, compress,
// poweredByHeader and the like silently diverge from what the build used,
// while build-time options (routes, headers, redirects, deploymentId) keep
// working because they are baked into .next. That is why the gap stayed
// invisible. Hand the server the config the build resolved, the same way
// Next's own standalone server.js does.
//
// Loaded with `node --require ./next-runtime-config.js ... next start` (see
// the Dockerfile CMD). Runs before Next, so it must stay dependency-free.
const path = require("path");

const manifest = path.join(__dirname, ".next", "required-server-files.json");

let config;
try {
  config = require(manifest).config;
} catch (err) {
  console.error(`[next-runtime-config] cannot read ${manifest}: ${err.message}`);
  process.exit(1);
}
if (!config || typeof config !== "object") {
  console.error(`[next-runtime-config] ${manifest} carries no config object`);
  process.exit(1);
}

if (!process.env.__NEXT_PRIVATE_STANDALONE_CONFIG) {
  process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(config);
}
