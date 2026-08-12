/**
 * The deployment bundle a self-hoster downloads instead of paying for
 * managed hosting: the config they just customized, plus the few files that
 * turn it into a running site.
 *
 * Everything here is pure and browser-only. There is no zip dependency
 * anywhere in this monorepo and adding one costs a workspace build review
 * plus the minimum-release-age wait, so the archive is written by hand in
 * the STORE (uncompressed) format. That is the part of the ZIP spec every
 * extractor has implemented since 1989: local headers, a central directory
 * and an end-of-central-directory record, with no compression to get wrong.
 * The files are small text; compression would save nothing worth the risk.
 */

export interface BundleFile {
  name: string;
  content: string;
}

export interface SelfHostBundleInput {
  /** The composed config document, already stripped of managed-only markers. */
  config: unknown;
  /** The blog account or community id; used for filenames and examples only. */
  username: string;
  /** Image tag to pin, e.g. `sha-abc1234`. */
  tag: string;
  /** The domain the owner will serve from, if they told us. */
  domain?: string;
}

/** Shown wherever the owner has not named their own domain yet. */
export const EXAMPLE_DOMAIN = "blog.example.com";

/** A DNS name: labels of letters, digits and inner hyphens, at least two. */
const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/**
 * The bare hostname behind whatever the owner typed, or null if it is not
 * one. People paste `https://blog.example.com/`, and the raw value used to
 * land in the Caddyfile and README verbatim, producing addresses like
 * `https://https://blog.example.com/rss.xml`. Worse, a value carrying a
 * newline would have written extra lines into the generated Caddyfile,
 * which is a config language where a stray line is a new directive.
 */
export function normalizeDomain(input: string | undefined): string | null {
  const trimmed = (input ?? "").trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let host: string;
  try {
    const url = new URL(withScheme);
    // Anything but plain http(s) is a paste accident, not a site address.
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    host = url.hostname.toLowerCase();
  } catch {
    return null;
  }
  return HOSTNAME.test(host) ? host : null;
}

function composeYml(): string {
  return `# Ecency self-hosted blog.
#
# TAG is set in .env beside this file. It is required and has no default:
# a moving tag would silently change what this deployment runs. Upgrade by
# editing .env and re-running the two commands in README.md; roll back by
# putting the previous tag back.

services:
  blog:
    image: ecency/self-hosted:\${TAG:?TAG is required, see .env}
    container_name: ecency-blog
    restart: unless-stopped
    ports:
      - "\${BIND:-127.0.0.1}:\${PORT:-3000}:80"
    volumes:
      # Your settings. Edit the file and restart; no rebuild, no new image.
      - ./config.json:/usr/share/nginx/html/config.json:ro
      # SEO files, once you run the generator (see README.md). Keep these
      # commented until the files exist: Docker creates a DIRECTORY for a
      # missing mount source, and an empty directory mounted over robots.txt
      # replaces the working one the image ships.
      # - ./seo/robots.txt:/usr/share/nginx/html/robots.txt:ro
      # - ./seo/sitemap.xml:/usr/share/nginx/html/sitemap.xml:ro
      # - ./seo/rss.xml:/usr/share/nginx/html/rss.xml:ro
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:80/"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 5s
`;
}

function envFile(tag: string): string {
  return `# Compose reads this file on every command. The image build this
# deployment runs: sha-<7> and vX.Y.Z tags never move, develop and latest do.
TAG=${tag}

# Host port the blog is published on. The container always listens on 80.
PORT=3000

# Published on loopback by default, for a reverse proxy to serve. Set
# 0.0.0.0 only to expose the site directly, with no proxy and no HTTPS.
BIND=127.0.0.1
`;
}

function caddyfile(domain: string): string {
  return `# Caddy gets and renews a Let's Encrypt certificate on its own, so this
# is the whole HTTPS configuration. Run Caddy on the host, or add it as a
# second service in docker-compose.yml.

${domain} {
    reverse_proxy 127.0.0.1:3000
}
`;
}

function readme(username: string, tag: string, domain: string, hasDomain: boolean): string {
  return `# ${username}'s Ecency blog

Your blog, configured the way you left it on ecency.com, ready to run on
your own server. Nothing here talks to Ecency's hosting: the app reads posts
straight from the Hive blockchain, and \`config.json\` is yours to edit.

## What is in here

| File | What it is |
|------|-----------|
| \`config.json\` | Everything you customized: theme, colours, fonts, title |
| \`docker-compose.yml\` | The one service that serves the site |
| \`.env\` | The pinned image tag and the port |
| \`Caddyfile\` | HTTPS in two lines, if you use Caddy |

## Run it

Requires Docker and Docker Compose on a machine with a public address.

\`\`\`bash
docker compose up -d
\`\`\`

The site is now on port 3000, published on loopback so a reverse proxy can
serve it over HTTPS. Check it with \`curl -I localhost:3000\` and read the
logs with \`docker compose logs -f\`. To expose it directly instead, with no
proxy and therefore no HTTPS, set \`BIND=0.0.0.0\` in \`.env\`.

## Put it on your domain

${
  hasDomain
    ? `Point ${domain}'s DNS A record at your server, then run Caddy with the
included Caddyfile:`
    : `Point your domain's DNS A record at your server, replace
${EXAMPLE_DOMAIN} in the Caddyfile with your own name, then run Caddy:`
}

\`\`\`bash
caddy run --config Caddyfile
\`\`\`

Caddy obtains and renews the certificate itself. If you prefer nginx, proxy
your server block to \`127.0.0.1:3000\` and use certbot for certificates.

## Change settings later

Edit \`config.json\` and restart:

\`\`\`bash
docker compose restart
\`\`\`

The file is mounted, not baked into the image, so an upgrade never discards
your settings. The site also has a built-in Configuration Editor: sign in as
@${username} and open it from the floating menu. On a self-hosted instance it
offers a Download rather than a Save, because only you can write this file;
download the edited config over the one beside \`docker-compose.yml\` and
restart.

## Upgrade and roll back

\`\`\`bash
# edit TAG in .env to the newer build, then:
docker compose pull
docker compose up -d
\`\`\`

Rolling back is the same two commands with the previous tag, which is why
the tag is pinned instead of floating. This bundle pins \`${tag}\`. Newer tags
are listed at https://hub.docker.com/r/ecency/self-hosted/tags, and
https://api.blogs.ecency.com/health reports what Ecency's own platform runs.

## Search engines and feeds (optional)

Generate \`robots.txt\`, \`sitemap.xml\` and \`rss.xml\` for your site, then
uncomment the three SEO mounts in \`docker-compose.yml\`:

\`\`\`bash
docker run --rm -v "$PWD:/work" ecency/hosting-api:${tag} \\
  npm run generate-seo -- \\
  --config /work/config.json \\
  --url https://${domain} \\
  --out /work/seo
\`\`\`

Run it on a cron; hourly is plenty. The \`--url\` value must be a plain https
origin with no path or query. Afterwards, point the site's own feed link at
your feed by adding to \`config.json\`:

\`\`\`json
{ "configuration": { "general": { "rssFeedUrl": "https://${domain}/rss.xml" } } }
\`\`\`

## Signing in

Hive Keychain and HiveAuth work with no setup. Hivesigner needs an app whose
redirect URI is your own address, so the button stays hidden until you name
one: register an app and put its id in \`config.json\` under
\`configuration.general.hivesigner.clientId\`, or email hello@ecency.com to
have your address added to the shared \`ecency.app\` app.

## Support

The app is open source at https://github.com/ecency/vision-web. Deployment
notes live in \`apps/self-hosted/DEPLOYMENT.md\`. Running it is your
responsibility: Ecency does not have access to your server, and there is no
fee.
`;
}

/** The files that make up the bundle, in the order they are archived. */
export function buildSelfHostBundle(input: SelfHostBundleInput): BundleFile[] {
  // A value that is not a hostname is treated as absent: the bundle then
  // carries the placeholder and tells the reader to replace it, which is
  // honest, rather than writing their paste into a config file.
  const normalized = normalizeDomain(input.domain);
  const hasDomain = normalized !== null;
  const domain = normalized ?? EXAMPLE_DOMAIN;
  return [
    { name: "README.md", content: readme(input.username, input.tag, domain, hasDomain) },
    { name: "config.json", content: `${JSON.stringify(input.config, null, 2)}\n` },
    { name: "docker-compose.yml", content: composeYml() },
    { name: ".env", content: envFile(input.tag) },
    { name: "Caddyfile", content: caddyfile(domain) },
  ];
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS date and time, which is what the ZIP header carries. */
function dosDateTime(date: Date): { time: number; date: number } {
  return {
    time:
      (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f),
    date:
      ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/**
 * A ZIP archive with every entry STORED. Deterministic given the same files
 * and timestamp, which is what makes it testable.
 */
export function zipStore(files: BundleFile[], modified: Date = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(modified);

  const entries = files.map((file) => ({
    nameBytes: encoder.encode(file.name),
    data: encoder.encode(file.content),
  }));

  const localSize = entries.reduce((n, e) => n + 30 + e.nameBytes.length + e.data.length, 0);
  const centralSize = entries.reduce((n, e) => n + 46 + e.nameBytes.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);

  let offset = 0;
  const offsets: number[] = [];
  const crcs: number[] = [];

  for (const entry of entries) {
    offsets.push(offset);
    const crc = crc32(entry.data);
    crcs.push(crc);

    view.setUint32(offset, 0x04034b50, true); // local file header
    view.setUint16(offset + 4, 20, true); // version needed
    view.setUint16(offset + 6, 0x0800, true); // UTF-8 names
    view.setUint16(offset + 8, 0, true); // stored, no compression
    view.setUint16(offset + 10, time, true);
    view.setUint16(offset + 12, date, true);
    view.setUint32(offset + 14, crc, true);
    view.setUint32(offset + 18, entry.data.length, true); // compressed size
    view.setUint32(offset + 22, entry.data.length, true); // uncompressed size
    view.setUint16(offset + 26, entry.nameBytes.length, true);
    view.setUint16(offset + 28, 0, true); // no extra field
    offset += 30;
    out.set(entry.nameBytes, offset);
    offset += entry.nameBytes.length;
    out.set(entry.data, offset);
    offset += entry.data.length;
  }

  const centralStart = offset;
  entries.forEach((entry, i) => {
    view.setUint32(offset, 0x02014b50, true); // central directory header
    view.setUint16(offset + 4, 20, true); // version made by
    view.setUint16(offset + 6, 20, true); // version needed
    view.setUint16(offset + 8, 0x0800, true);
    view.setUint16(offset + 10, 0, true);
    view.setUint16(offset + 12, time, true);
    view.setUint16(offset + 14, date, true);
    view.setUint32(offset + 16, crcs[i], true);
    view.setUint32(offset + 20, entry.data.length, true);
    view.setUint32(offset + 24, entry.data.length, true);
    view.setUint16(offset + 28, entry.nameBytes.length, true);
    view.setUint16(offset + 30, 0, true); // extra
    view.setUint16(offset + 32, 0, true); // comment
    view.setUint16(offset + 34, 0, true); // disk number
    view.setUint16(offset + 36, 0, true); // internal attrs
    view.setUint32(offset + 38, 0, true); // external attrs
    view.setUint32(offset + 42, offsets[i], true);
    offset += 46;
    out.set(entry.nameBytes, offset);
    offset += entry.nameBytes.length;
  });

  view.setUint32(offset, 0x06054b50, true); // end of central directory
  view.setUint16(offset + 4, 0, true); // this disk
  view.setUint16(offset + 6, 0, true); // disk with central directory
  view.setUint16(offset + 8, entries.length, true);
  view.setUint16(offset + 10, entries.length, true);
  view.setUint32(offset + 12, offset - centralStart, true);
  view.setUint32(offset + 16, centralStart, true);
  view.setUint16(offset + 20, 0, true); // no archive comment

  return out;
}

/** The finished archive for one customized blog. */
export function buildSelfHostZip(input: SelfHostBundleInput, modified?: Date): Uint8Array {
  return zipStore(buildSelfHostBundle(input), modified);
}
