# Ecency Self-Hosted Blog - Deployment Guide

Deploy your own blog powered by the Hive blockchain. This guide covers Docker deployment for the self-hosted Ecency blog application.

## Table of Contents

- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Deployment Options](#deployment-options)
- [Production Deployment](#production-deployment)
- [Custom Domain & SSL](#custom-domain--ssl)
- [Updating](#updating)
- [Troubleshooting](#troubleshooting)

## Quick Start

### Prerequisites

- Docker 20.10+ and Docker Compose 2.0+
- A Hive blockchain account (for blog mode)
- (Optional) A domain name for production deployment

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

```bash
# Build and start
docker compose up -d

# View logs
docker compose logs -f
```

Your blog is now running at `http://localhost:80`

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
| `medium` | Editorial style (default) |
| `minimal` | Clean, minimalist |
| `magazine` | Magazine layout |
| `developer` | Tech-focused |
| `modern-gradient` | Modern with gradients |

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
    "listType": "list",
    "sidebar": {
      "placement": "right",
      "followers": { "enabled": true },
      "following": { "enabled": true },
      "hiveInformation": { "enabled": true }
    }
  }
}
```

## Deployment Options

### Option 1: Docker Compose (Recommended)

```bash
# Start in detached mode
docker compose up -d

# Custom port
PORT=8080 docker compose up -d
```

### Option 2: Docker Run

```bash
# Build the image
docker build -t myblog -f Dockerfile ../..

# Run with config volume mount
docker run -d \
  -p 80:80 \
  -v $(pwd)/config.json:/usr/share/nginx/html/config.json:ro \
  --name myblog \
  myblog
```

### Option 3: Pre-built Image

```bash
# Pull a specific version from Docker Hub
docker pull ecency/self-hosted:sha-abc1234

# Run with your config
docker run -d \
  -p 80:80 \
  -v $(pwd)/config.json:/usr/share/nginx/html/config.json:ro \
  ecency/self-hosted:sha-abc1234
```

### Option 4: Build with Config Baked In

For immutable deployments (e.g., Kubernetes), use base64 encoding to safely pass the config:

```bash
# Encode config as base64 to avoid shell interpolation issues
CONFIG_B64=$(base64 -w0 config.json)  # Linux
# or: CONFIG_B64=$(base64 -i config.json)  # macOS

# Build with base64-encoded config
docker build \
  --build-arg CONFIG_JSON_B64="$CONFIG_B64" \
  -t myblog:configured \
  -f Dockerfile ../..
```

The Dockerfile should decode this during build:

```dockerfile
ARG CONFIG_JSON_B64
RUN echo "$CONFIG_JSON_B64" | base64 -d > /usr/share/nginx/html/config.json
```

**Alternative: COPY method** (simpler, requires config.json in build context):

```dockerfile
# In Dockerfile, add:
COPY apps/self-hosted/config.json /usr/share/nginx/html/config.json
```

Then build without build-args:
```bash
docker build -t myblog:configured -f Dockerfile ../..
```

## Production Deployment

The managed hosting platform runs behind nginx with SSL terminated at the reverse proxy layer. The Docker containers bind to localhost-only ports and nginx routes traffic to them.

### With Nginx Reverse Proxy (Current Production Setup)

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

### With Caddy (Simple SSL)

```
blog.yourdomain.com {
    reverse_proxy 127.0.0.1:3100
}
```

### Standalone (Single Blog)

For a single self-hosted blog without the managed hosting platform:

```bash
docker run -d \
  -p 80:80 \
  -v $(pwd)/config.json:/usr/share/nginx/html/config.json:ro \
  ecency/self-hosted:sha-abc1234
```

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

```bash
# Pull new images and restart
TAG=sha-abc1234 docker compose up -d

# Or pull latest for your channel
TAG=develop docker compose pull
TAG=develop docker compose up -d
```

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
docker compose logs blog-server

# Check if port is in use
lsof -i :3100
```

### Config Changes Not Reflected

1. Make sure `config.json` is mounted correctly
2. Hard refresh browser (Ctrl+Shift+R)
3. Check nginx is serving the right file:

```bash
docker compose exec blog-server cat /usr/share/nginx/html/config.json
```

### Build Failures

```bash
# Clean Docker cache
docker system prune -a

# Rebuild from scratch
docker compose build --no-cache
```

### Performance Issues

1. Enable gzip compression (already configured in nginx.conf)
2. Use a CDN like Cloudflare
3. Ensure image proxy is fast (default: i.ecency.com)

## Architecture

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

| Plan | Price | Features |
|------|-------|----------|
| **Standard** | 0.1 HBD/month | Custom subdomain, SSL, CDN, 99.9% uptime |
| **Pro** | 0.5 HBD/month | Custom domain, priority support, analytics |

### How It Works

1. **Visit** [https://blogs.ecency.com/hosting](https://blogs.ecency.com/hosting)
2. **Enter** your Hive username
3. **Configure** your blog (title, theme, style)
4. **Pay** via Hive Keychain or manual HBD transfer
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
