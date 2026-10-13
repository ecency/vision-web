---
paths:
  - "infra/**"
  - "apps/web/docker-compose*.yml"
  - ".github/workflows/**"
  - "scripts/origin-config-audit.mjs"
---

# Deployment and origin infra

## Deployment topology (operational context)

- `apps/web/docker-compose.yml` (staging) and `apps/web/docker-compose.production.yml` (prod) define the **whole `vision` swarm stack** — including the `vapi` service (the separate [vision-api](https://github.com/ecency/vision-api) C#/.NET proxy, image `ecency/api`), `web`, and supporting services.
- CI deploys: push to `develop` → staging stack deploy (`staging.yml`, which path-ignores `apps/self-hosted/hosting/**`); push to `main` → production stack deploy in BOTH regions (`deploy-EU` and `deploy-US` in `master.yml`, each running `docker stack deploy` against its own host). vision-api's own CI independently updates the running `vision_vapi` service by image digest.
- **A stack deploy from this repo resets the full service spec of every service in the stack** (including `vapi`: image back to `:latest`, env, logging options) to what these compose files declare. Anything applied out-of-band with `docker service update` is overwritten — durable service settings belong in these files.

## Origin nginx (`infra/origin`)

- **infra/origin** - The web origin nginx vhosts (`eu`/`us.ecency.com.conf`), tracked since
  2026-08-20. ⛔ **This repo is public**: structure is committed, thresholds and addresses are
  not — they live in host-only includes. Enforced by `scripts/origin-config-audit.mjs` in CI.
  ⛔ CI does **not** deploy these; they are applied by hand to both boxes, and the rule is
  apply-and-reload BEFORE committing so the tracked copy matches what is running. See
  `infra/origin/README.md`.

`origin-config-audit` keeps thresholds, source addresses, inline allowlists, secret markers and
fail-open wildcard includes out of `infra/`. It reads **comments** too — an earlier version
stripped them and reported a clean run while every rate sat in prose two lines above. Run
`--self-test` first: it proves each rule still fires, so a regex edited into uselessness is
caught in the same step that relies on it.
