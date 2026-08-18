# syntax=docker/dockerfile:1.7
FROM node:24.16.0 AS base
WORKDIR /var/app

ARG PNPM_VERSION=11.5.0
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
ENV CI=true

# ---- manifests ----
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/self-hosted/package.json apps/self-hosted/package.json
COPY packages/sdk/package.json packages/sdk/package.json
COPY packages/wallets/package.json packages/wallets/package.json
COPY packages/render-helper/package.json packages/render-helper/package.json
COPY packages/ui/package.json packages/ui/package.json
# patchedDependencies resolves these at install time, before the source COPY below
COPY patches patches

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

# ---- source ----
COPY . .

# ---- public build-time envs ----
ARG NEXT_PUBLIC_GMAPS_API_KEY
ARG NEXT_PUBLIC_GMAPS_MAP_ID
ENV NEXT_PUBLIC_GMAPS_API_KEY=${NEXT_PUBLIC_GMAPS_API_KEY}
ENV NEXT_PUBLIC_GMAPS_MAP_ID=${NEXT_PUBLIC_GMAPS_MAP_ID}
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY}

# ---- Sentry (make them visible to the build) ----
ARG SENTRY_AUTH_TOKEN
ARG SENTRY_ORG
ARG SENTRY_PROJECT
# Pinned to the deploying commit SHA so source-map upload and runtime
# Sentry.init agree on the same release identifier — even when the
# package.json version is unchanged across deploys.
ARG SENTRY_RELEASE
# Deploy target ("staging" for alpha, "production" for prod). Inlined into the
# client bundle at build time (next.config.js `env`) and read by Sentry.init.
ARG SENTRY_ENVIRONMENT
ENV SENTRY_AUTH_TOKEN=${SENTRY_AUTH_TOKEN}
ENV SENTRY_ORG=${SENTRY_ORG}
ENV SENTRY_PROJECT=${SENTRY_PROJECT}
ENV SENTRY_RELEASE=${SENTRY_RELEASE}
ENV SENTRY_ENVIRONMENT=${SENTRY_ENVIRONMENT}
ENV SENTRY_LOG_LEVEL=debug

# Single build that emits the EXACT assets we ship
# Build packages first, then the web app (exclude self-hosted)
RUN pnpm build:packages && pnpm --filter @ecency/web build

# Prune runtime deps for the web workspace
RUN pnpm deploy --filter @ecency/web --prod --legacy /var/app/.deploy-workdir \
  && rm -rf apps/web/node_modules \
  && mv /var/app/.deploy-workdir/node_modules apps/web/node_modules \
  && rm -rf /var/app/.deploy-workdir

# Re-apply next-ws patch after pnpm deploy (deploy creates fresh node_modules without the patch)
# Use node to run the CLI directly from node_modules
RUN cd apps/web && node node_modules/next-ws/dist/cli.cjs patch

# ---------- production ----------
FROM node:24.16.0 AS production
WORKDIR /var/app

ENV TINI_VERSION=v0.18.0
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini-static /tini
RUN chmod +x /tini
ENTRYPOINT ["/tini", "--"]

ENV NODE_ENV=production

# ffmpeg powers the /api/speak-audio endpoint, which transcodes Liketu "Speak"
# voice posts (Opus/WebM) to AAC/m4a so iOS AVPlayer (react-native-video, Safari)
# can play them. Runtime-only dependency; the build stage does not need it.
# Installed before the app artifacts COPY so this apt layer caches across
# code-only deploys.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

# Carry the Sentry release identifier into the runtime container.
# Build-args don't cross stage boundaries automatically — each stage that
# needs them must redeclare ARG. Without this the server and edge runtimes
# would read process.env.SENTRY_RELEASE as unset and fall back to the
# package.json version, splitting releases between client (tagged at
# build) and server (tagged at runtime).
ARG SENTRY_RELEASE
ENV SENTRY_RELEASE=${SENTRY_RELEASE}
# Same for the environment label, so the server/edge runtimes tag events with
# the same staging/production value the client bundle was built with.
ARG SENTRY_ENVIRONMENT
ENV SENTRY_ENVIRONMENT=${SENTRY_ENVIRONMENT}

# Copy runtime artifacts from the single build
COPY --from=base /var/app/package.json ./package.json
COPY --from=base /var/app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=base /var/app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=base /var/app/apps/web/package.json ./apps/web/package.json
COPY --from=base /var/app/apps/web/healthCheck.js ./apps/web/healthCheck.js
COPY --from=base /var/app/apps/web/public ./apps/web/public
COPY --from=base /var/app/apps/web/.next ./apps/web/.next
COPY --from=base /var/app/node_modules ./node_modules
COPY --from=base /var/app/apps/web/node_modules ./apps/web/node_modules

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 CMD node /var/app/apps/web/healthCheck.js

# Start Next.js directly rather than via `pnpm start`. The production image is
# already built; it needs no package manager at runtime. pnpm 11 runs a
# "verify deps before run" check before the start script, decides the pruned
# (`pnpm deploy --prod`) node_modules is stale, tries to purge + reinstall, and
# aborts in a TTY-less container (ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY ->
# exit 1). That made every Swarm rollout crash on start and silently roll back
# to the previous image, so deploys went green while prod kept serving the old
# build. Invoking next directly skips that check (and a per-start corepack
# download of pnpm).
WORKDIR /var/app/apps/web
CMD ["node", "./node_modules/next/dist/bin/next", "start"]
