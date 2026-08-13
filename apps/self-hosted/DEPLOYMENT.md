# Ecency Self-Hosted Blog - Deployment Guide

Deploy your own blog powered by the Hive blockchain. This guide covers Docker deployment for the self-hosted Ecency blog application.

## Table of Contents

- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Choosing an image tag](#choosing-an-image-tag)
- [Deployment Options](#deployment-options)
- [Production Deployment](#production-deployment)
- [SEO files (robots, sitemap, RSS)](#seo-files-robots-sitemap-rss)
- [Custom Domain & SSL](#custom-domain--ssl)
- [Updating](#updating)
- [Troubleshooting](#troubleshooting)

## Quick Start

### Prerequisites

- Docker 20.10+ and Docker Compose 2.0+
- A Hive blockchain account (for blog mode)
- (Optional) A domain name for production deployment

A shortcut past steps 1 and 2:
[blogs.ecency.com/hosting](https://blogs.ecency.com/hosting) lets you customize
the look in the browser and then hands you the whole deployment as a download
instead of a hosted blog. The archive holds `config.json`,
`docker-compose.yml`, `.env` with an image tag already pinned, a `Caddyfile`
and a README. Nothing is reserved and nothing is charged on that path: it is
the same files as below, filled in for you. Unzip it and go straight to step 3.

### 1. Clone and Configure

```bash
# Clone the repository
git clone https://github.com/ecency/vision-web.git
cd vision-web/apps/self-hosted

# Copy the config template
cp config.template.json config.json
```

### 2. Edit Configuration

Edit `config.json` with your settings:

```json
{
  "version": 1,
  "configuration": {
    "general": {
      "theme": "system",
      "styleTemplate": "medium",
      "language": "en",
      "imageProxy": "https://i.ecency.com"
    },
    "instanceConfiguration": {
      "type": "blog",
      "username": "YOUR_HIVE_USERNAME",
      "meta": {
        "title": "My Hive Blog",
        "description": "My personal blog on Hive",
        "favicon": "https://your-favicon-url.com/favicon.ico"
      }
    }
  }
}
```

### 3. Start the Application

Pick an image tag first. `TAG` is required and has no default, so a
deployment always states what it runs; see [Choosing an image
tag](#choosing-an-image-tag).

Put it in a `.env` file beside `docker-compose.yml` rather than in front of a
single command: compose reads that file for EVERY invocation, so `logs`,
`restart` and `down` keep working afterwards.

```bash
# Pin the image build. sha-abc1234 is a PLACEHOLDER: replace it with a tag
# that exists, from https://hub.docker.com/r/ecency/self-hosted/tags
echo "TAG=sha-abc1234" > .env

# Pull and start
docker compose up -d

# View logs
docker compose logs -f
```

The site is published on loopback by default, so reach it locally first and
put a reverse proxy in front of it for the public address. To serve directly
with no proxy (and therefore no HTTPS), set `BIND=0.0.0.0` in `.env`.

Your blog is now running at `http://localhost:3000` (the container listens on
port 80 and compose publishes it as `PORT`, which defaults to 3000). If you
changed `PORT`, `docker compose port blog 80` prints where it actually
landed, and every proxy example below has to point at that same port.

## Configuration

### Instance Types

#### Blog Mode (Personal Blog)

Display posts from a single Hive account:

```json
{
  "instanceConfiguration": {
    "type": "blog",
    "username": "your-hive-username"
  }
}
```

#### Community Mode

Display posts from a Hive community:

```json
{
  "instanceConfiguration": {
    "type": "community",
    "communityId": "hive-123456"
  }
}
```

### Theme Options

| Style Template | Description |
|----------------|-------------|
| `medium` | Clean long-form reading with a classic serif voice (default) |
| `minimal` | Quiet, spacious and out of the way of your words |
| `magazine` | Warm editorial look with display headlines |
| `developer` | Dark, code-friendly and easy on late-night eyes |
| `modern-gradient` | Bright surfaces with a vivid accent |
| `journal` | Ink on paper: one quiet column for long-form writing |
| `reader` | Your archive beside the open post, the way a feed reader works |
| `gallery` | A wall of pictures: the image leads, the words step back |
| `terminal` | A console listing: monospace, dense, no card in sight |

Four of the nine are CSS-token-only. `medium`, `minimal`, `developer` and
`modern-gradient` render the identical component tree and differ only in
colour, type and spacing.

The other five change the page STRUCTURE as well:

- `magazine` owns the archive: the newest entry becomes a hero, with the rest
  as rows. Everything else, sidebar included, stays as configured.
- `journal` brings its own shell and entry: one quiet column, no card chrome.
- `reader` brings its own shell and home pane: a split frame with the archive
  as a persistent rail beside the open post.
- `gallery` brings its own tile and an empty sidebar: the archive becomes a
  grid of covers.
- `terminal` brings its own shell and archive: a console prompt with filters
  as flags, above a dense dated listing.

`journal`, `reader`, `gallery` and `terminal` render no sidebar whatever the
config says, so each declares the sidebar unsupported and the Configuration
Editor hides that option while the template is active. Your stored value is
left alone: it applies again the moment you switch back to a template that
uses it. An option is never silently inert.

#### How a template is defined

A style template is a MANIFEST. `src/themes/manifest.ts` defines the
`ThemeComponents` seam (`Shell`, `Navigation`, `Sidebar`, `ArchiveList`,
`PostCard`) plus the options a template can declare it does not consume.
`src/themes/registry.ts` maps every roster id to its manifest.
`src/themes/use-theme-components.ts` resolves the active template's components
over the shared defaults, so a seam a template does not override renders
exactly what it always did. The implementations sit beside the registry in
`src/themes/magazine/`, `journal/`, `reader/`, `gallery/` and `terminal/`.

Adding a template, following the roster's own header comment in
`hosting/api/src/style-templates.ts`:

1. Add the id to `STYLE_TEMPLATES` there. That file is the single source of
   truth for which ids exist, kept dependency-free because the SPA imports it
   into browser bundles.
2. Create its CSS under `src/styles/themes/` and import it from that
   directory's `index.css`.
3. Add the editor's label string to i18n (`src/core/i18n-strings.ts`).
4. Add its card to `hosting/api/src/style-template-display.ts` (name, tagline,
   swatch colours, heading style), which is what the signup picker renders.

The guard test `src/styles/style-template-roster.test.ts` fails until the CSS
side agrees; the label map in `src/features/floating-menu/config-fields.ts` and
the display catalog both fail typecheck until their entries exist. A template
that only restyles needs nothing else. One that changes structure adds a
manifest entry in `src/themes/registry.ts` carrying its `components`, plus
`unsupportedOptions` for anything its components do not consume.

### Feature Flags

Enable/disable features in your config:

```json
{
  "features": {
    "likes": { "enabled": true },
    "comments": { "enabled": true },
    "post": {
      "text2Speech": { "enabled": true }
    },
    "auth": {
      "enabled": true,
      "methods": ["keychain", "hivesigner", "hiveauth"]
    }
  }
}
```

`methods` accepts `keychain`, `hivesigner` and `hiveauth`. Any other name is ignored.

### Hivesigner Login

Listing `hivesigner` is not enough on its own. The button stays hidden until the
instance names a Hivesigner app:

```json
{
  "general": {
    "hivesigner": { "clientId": "your-app-id" }
  }
}
```

Two ways to get an id:

- Register your own Hivesigner app and put its id here.
- Email hello@ecency.com to get this site's `/auth` address registered on the
  shared `ecency.app` app, then put `ecency.app` here.

Hivesigner refuses to return to an address its app has not registered, so a
login button offered without this can only end on an error page. That is why it
stays hidden instead. Site owners can also set the id in the Configuration
Editor, under General Settings > Hivesigner.

### Layout Options

```json
{
  "layout": {
    "sidebar": {
      "followers": { "enabled": true },
      "hiveInformation": { "enabled": true }
    }
  }
}
```

The feed is a single column and the sidebar sits on the right. Both were once
configurable, no instance ever changed either one, plus the unused settings
carried rendering bugs of their own, so they were retired. A stored config that
still carries `listType` or `sidebar.placement` is ignored rather than rejected,
so nothing needs migrating.

Themes that render no sidebar at all (Journal, Reader, Gallery, Terminal)
declare it unsupported. The Configuration Editor hides the section instead
of leaving switches that do nothing.

### The Configuration Editor

Every instance ships an in-browser editor for these settings, behind the
floating menu button. It edits the same document as `config.json`, so nothing
it offers is editor-only. Nothing `config.json` accepts is out of its reach
either.

It has four tabs
(`src/features/floating-menu/components/floating-menu-window.tsx`):

| Tab | Holds |
|-----|-------|
| Appearance | Template cards, then theme, styles (accent with quick picks, fonts) and layout |
| Identity | Site metadata (title, description, favicon) and language |
| Features | Likes, comments, publishing, auth methods |
| Advanced | The full field set |

Appearance, Identity and Features are curated views over the one schema in
`config-fields.ts`, picked by path (`TAB_FIELD_PATHS`). Advanced exposes that
whole schema, so a setting a curated tab leaves out is still reachable in the
editor rather than becoming config-file-only.

The editor compares what you are editing against the document the site
currently stores. That gives it an unsaved-changes indicator, plus a Revert
that puts everything back to the stored document in one step. Picking a
template previews it live, structure included, before you commit to it.

On a managed instance the editor saves through the hosting API. On an
independent deployment there is no API to save to, so the button downloads the
document instead, for you to put beside `docker-compose.yml` as `config.json`
and restart.

## Deployment Options

### Choosing an image tag

Published tags for `ecency/self-hosted` (and its paired `ecency/hosting-api`):

| Tag | Moves? | Use it for |
|-----|--------|-----------|
| `vX.Y.Z` | never | **what to pin**: a tagged release, e.g. `v1.0.0` |
| `sha-<7>` | never | one immutable build between releases, e.g. `sha-abc1234` |
| `develop` | every merge | tracking development, never a deployment you care about |
| `latest` | releases only | convenience; it does not move until a release is tagged |

Prefer a `vX.Y.Z` release tag: `v1.0.0` was published on 2026-08-12 from the
`self-hosted-v1.0.0` git tag, which is the only thing that publishes an
immutable version and advances `:latest`. A `sha-<7>` tag pins one specific
build when you need something newer than the last release. Take a tag that exists
from [Docker Hub](https://hub.docker.com/r/ecency/self-hosted/tags), which
is the source of truth, or read what the managed platform runs from
`https://api.blogs.ecency.com/health`, which answers `{version, sha}`.

**`sha-abc1234` throughout this guide is a placeholder.** Substitute a real
tag before running any command that mentions it. The blog and the hosting
API are built from the same commit in the same CI run, so the same `sha-<7>`
tag exists for `ecency/self-hosted` and `ecency/hosting-api`; if you pick one
that is only in one repository, choose another.

### Option 1: Docker Compose (Recommended)

Settings live in `.env` beside `docker-compose.yml`, which compose reads on
every invocation:

```bash
cat > .env <<'ENV'
TAG=sha-abc1234
PORT=3000
ENV

docker compose up -d
```

`PORT` is what the site is published on; the container always listens on 80
inside. A one-off command can still override either (`PORT=8080 docker
compose up -d`), but a value only on the command line is gone by the next
compose command, and `${TAG:?...}` will stop that one.

### Option 2: Docker Run

```bash
docker run -d \
  -p 3000:80 \
  -v $(pwd)/config.json:/usr/share/nginx/html/config.json:ro \
  --name myblog \
  ecency/self-hosted:sha-abc1234
```

### Option 3: Build from Source

Only needed to run modified code; the published images are built from this
same Dockerfile.

```bash
# From apps/self-hosted, with the monorepo as build context
docker build -t myblog -f Dockerfile ../..

docker run -d \
  -p 3000:80 \
  -v $(pwd)/config.json:/usr/share/nginx/html/config.json:ro \
  myblog
```

### Option 4: Build with Config Baked In

For immutable deployments (e.g. Kubernetes) where mounting a file is
awkward. The Dockerfile already accepts the config as a build argument, so
nothing needs editing: base64 keeps the JSON clear of shell interpolation.

```bash
# Encode config as base64 to avoid shell interpolation issues
CONFIG_B64=$(base64 -w0 config.json)  # Linux
# or: CONFIG_B64=$(base64 -i config.json)  # macOS

docker build \
  --build-arg CONFIG_JSON_B64="$CONFIG_B64" \
  -t myblog:configured \
  -f Dockerfile ../..
```

A baked config trades the main advantage of this app away: with a mounted
file, changing settings is an edit plus a container restart, while a baked
one needs a rebuild for every change.

## Production Deployment

Put a reverse proxy in front of the container: it terminates TLS and
forwards to the port compose publishes (`PORT`, 3000 by default).

### With Caddy (recommended: certificates without ACME wiring)

```caddyfile
blog.yourdomain.com {
    reverse_proxy 127.0.0.1:3000
}
```

That is the whole configuration. Caddy obtains and renews a Let's Encrypt
certificate on its own, so there is no certbot timer to forget. The port must
match your `PORT`; `docker compose port blog 80` prints it.

### With Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name blog.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/blog.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/blog.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Certificates come from certbot: `certbot --nginx -d blog.yourdomain.com`. As
with Caddy, `proxy_pass` must point at your `PORT`.

### Managed platform reference (not a self-hosting recipe)

The rest of this section documents how Ecency's own multi-tenant platform is
wired, for anyone reading the `hosting/` directory. **A single self-hosted
blog needs none of it** — the ports below are that platform's, not yours.

The blog server container exposes port 80 internally, mapped to `127.0.0.1:3100` on the host. The hosting API exposes port 3001, mapped to `127.0.0.1:3101`.

```nginx
# Landing page and signup (behind Cloudflare)
server {
    listen 443 ssl http2;
    server_name blogs.ecency.com;

    ssl_certificate     /etc/ssl/certs/cert.pem;
    ssl_certificate_key /etc/ssl/private/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Hosting API (DNS-only, LE wildcard cert)
server {
    listen 443 ssl http2;
    server_name api.blogs.ecency.com;

    ssl_certificate     /etc/letsencrypt/live/blogs.ecency.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/blogs.ecency.com/privkey.pem;

    location /hosting/ {
        proxy_pass http://127.0.0.1:3101/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    location / {
        proxy_pass http://127.0.0.1:3101;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}

# Tenant blogs (DNS-only, LE wildcard cert)
server {
    listen 443 ssl http2;
    server_name *.blogs.ecency.com;

    ssl_certificate     /etc/letsencrypt/live/blogs.ecency.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/blogs.ecency.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```


## SEO files (robots, sitemap, RSS)

Managed instances get per-tenant `robots.txt`, `sitemap.xml` and `rss.xml`
generated automatically. An independent deployment produces the same files
with the generator shipped in the `ecency/hosting-api` image, run on a cron
(hourly is plenty; the feeds carry the latest 100 posts, assembled as five or
more paged bridge calls of 20 under one 30s budget, because the bridge errors
on a `limit` above 20):

```bash
# Pin the same tag the blog runs. Without one this pulls :latest, which
# moves independently of what you deployed.
docker run --rm -v "$PWD:/work" ecency/hosting-api:sha-abc1234 \
  npm run generate-seo -- \
  --config /work/config.json \
  --url https://blog.example.com \
  --out /work/seo
```

`--url` must be a plain https origin: no path, no query, no credentials.

Serve the output beside the app by uncommenting the SEO mounts in
`docker-compose.yml`:

```yaml
    volumes:
      - ./config.json:/usr/share/nginx/html/config.json:ro
      - ./seo/robots.txt:/usr/share/nginx/html/robots.txt:ro
      - ./seo/sitemap.xml:/usr/share/nginx/html/sitemap.xml:ro
      - ./seo/rss.xml:/usr/share/nginx/html/rss.xml:ro
```

Run the generator BEFORE the first `up` with those mounts uncommented.
Docker creates a directory for any mount source that does not exist, and an
empty directory mounted over `robots.txt` replaces the working one the image
ships.

Then point the app's RSS link at your own feed in `config.json`:

```json
{
  "configuration": {
    "general": {
      "rssFeedUrl": "https://blog.example.com/rss.xml"
    }
  }
}
```

Without the generator the app links the ecency.com feed for your account, so
the RSS link never points at a file that does not exist.

## Custom Domain & SSL

### Cloudflare (Recommended)

1. Point your domain's DNS A record to your server IP
2. Enable Cloudflare proxy (orange cloud) for the apex domain
3. SSL mode: Full (strict)
4. Generate a Cloudflare origin certificate for server-side SSL

For wildcard subdomains (`*.blogs.ecency.com`), use DNS-only (gray cloud) with a Let's Encrypt wildcard certificate via DNS challenge:

```bash
sudo apt install python3-certbot-dns-cloudflare
sudo certbot certonly --dns-cloudflare \
  --dns-cloudflare-credentials /root/.cloudflare/credentials.ini \
  -d 'blogs.ecency.com' -d '*.blogs.ecency.com'
```

### Let's Encrypt (Certbot)

```bash
# Install certbot
sudo apt install certbot

# Get certificate for a single domain
sudo certbot certonly --standalone -d blog.yourdomain.com

# Auto-renewal is configured automatically
```

## Updating

### Update with Docker Compose

Upgrading is a one-line change: point `TAG` at the newer build.

```bash
# Edit TAG in .env to the newer tag, then:
docker compose pull
docker compose up -d
```

Rolling back is the same two commands with the previous tag, which is
exactly why the tag is pinned rather than floating. Keep the last known-good
value somewhere; the line you just replaced in `.env` is enough.

Your `config.json` is untouched by an upgrade: it is mounted, not baked.

### Update Configuration Only

Since config.json is mounted as a volume, you can update it without rebuilding:

```bash
# Edit config
nano config.json

# Restart to pick up changes (or just refresh browser)
docker compose restart
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker compose logs blog

# Where the site is actually published (honours PORT and BIND)
docker compose port blog 80
```

`required variable TAG is missing a value` means exactly that: pick a tag
(see [Choosing an image tag](#choosing-an-image-tag)) or put one in `.env`.

### Config Changes Not Reflected

1. Make sure `config.json` is mounted correctly
2. Hard refresh browser (Ctrl+Shift+R)
3. Check nginx is serving the right file:

```bash
docker compose exec blog cat /usr/share/nginx/html/config.json
```

If that prints a directory listing error, `config.json` did not exist when
the container first started and Docker created a directory in its place.
Stop the stack, remove the directory, `cp config.template.json config.json`,
and start again.

### The Site Shows Someone Else's Demo Blog

The app falls back to its built-in demo config when the mounted
`config.json` is missing, is not valid JSON, or lacks a truthy `version` and
`configuration`. Check it parses:

```bash
python3 -m json.tool config.json > /dev/null && echo "config.json is valid JSON"
```

### Performance Issues

1. Enable gzip compression (already configured in nginx.conf)
2. Use a CDN like Cloudflare
3. Ensure image proxy is fast (default: i.ecency.com)

## Architecture (managed platform)

A single self-hosted blog is just the one container from Quick Start. The
diagram below is Ecency's multi-tenant platform, for readers of `hosting/`.

```
                        Internet
                           |
                    ┌──────┴──────┐
                    │   Nginx     │  SSL termination, routing
                    │  (host)     │  :80/:443
                    └──────┬──────┘
              ┌────────────┼────────────┐
              |            |            |
    blogs.ecency.com  api.blogs.*  *.blogs.*
              |            |            |
         :3100/tcp    :3101/tcp    :3100/tcp
              |            |            |
  ┌───────────┴──┐  ┌─────┴─────┐  (same as blog)
  │  Blog Server │  │ Hosting   │
  │  (nginx SPA) │  │ API       │
  └──────────────┘  └─────┬─────┘
                          |
              ┌───────────┼───────────┐
              |                       |
       ┌──────┴──────┐       ┌───────┴───────┐
       │ PostgreSQL  │       │    Redis      │
       │ (tenants,   │       │  (cache,      │
       │  payments)  │       │   pub/sub)    │
       └─────────────┘       └───────────────┘
              |
    ┌─────────┴─────────┐
    │ Payment Listener  │  Monitors Hive blockchain
    │ (background)      │  for HBD subscription payments
    └───────────────────┘
```

---

## Managed Hosting by Ecency

Don't want to manage your own infrastructure? Let Ecency host your blog.

### Pricing

Current prices are shown on the [hosting
page](https://blogs.ecency.com/hosting) and quoted again at checkout. They
are deliberately not repeated here: this file drifted from the real numbers
once already.

| Plan | Includes |
|------|----------|
| **Standard** | Subdomain on `blogs.ecency.com`, SSL, CDN, automatic upgrades |
| **Pro** | Everything above plus a custom domain |

### How It Works

1. **Visit** [https://blogs.ecency.com/hosting](https://blogs.ecency.com/hosting)
2. **Enter** your Hive username
3. **Configure** your blog (title, theme, style)
4. **Pay** by card (the default), or in HBD via Hive Keychain or a manual transfer
5. **Go live** at `username.blogs.ecency.com`

### Custom Domain Setup

For custom domains (Pro plan), add a CNAME record:

```
Type:  CNAME
Name:  blog (or @ for root domain)
Value: YOUR-USERNAME.blogs.ecency.com
TTL:   3600
```

### Payment Memo Format

```
To: ecency.hosting
Amount: 1.000 HBD
Memo: blog:YOUR_HIVE_USERNAME
```

For multi-month subscriptions:

```
Memo: blog:YOUR_HIVE_USERNAME:6
```

---

## Support

- GitHub Issues: https://github.com/ecency/vision-web/issues
- Discord: https://discord.me/ecency
- Hive: @ecency

## License

MIT License - see LICENSE file for details.
