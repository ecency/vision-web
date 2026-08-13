import { describe, it, expect } from "vitest";
import {
  buildSelfHostBundle,
  buildSelfHostZip,
  EXAMPLE_DOMAIN,
  normalizeDomain,
  zipStore
} from "@/features/hosting-signup/self-host-bundle";

// The archive is written by hand (no zip dependency exists in this monorepo),
// so these tests read it back through an independent parser rather than
// trusting the writer's own arithmetic. Every entry is verified by CRC, which
// is what an extractor checks before it will unpack anything.

interface ParsedEntry {
  name: string;
  content: string;
  crcOk: boolean;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Read the archive the way an extractor does: from the central directory. */
function readZip(zip: Uint8Array): ParsedEntry[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const decoder = new TextDecoder();

  // Locate the end-of-central-directory record (no archive comment).
  const eocd = zip.length - 22;
  expect(view.getUint32(eocd, true)).toBe(0x06054b50);
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);

  const entries: ParsedEntry[] = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(offset, true)).toBe(0x02014b50);
    const crc = view.getUint32(offset + 16, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(zip.subarray(offset + 46, offset + 46 + nameLength));

    // Follow the pointer into the local header and take the bytes after it.
    expect(view.getUint32(localOffset, true)).toBe(0x04034b50);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const extraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + extraLength;
    const data = zip.subarray(dataStart, dataStart + size);

    entries.push({ name, content: decoder.decode(data), crcOk: crc32(data) === crc });
    offset += 46 + nameLength;
  }
  return entries;
}

const INPUT = {
  config: {
    version: 1,
    configuration: {
      general: { theme: "system", styleTemplate: "journal" },
      instanceConfiguration: { username: "alice", meta: { title: "Alice writes" } }
    }
  },
  username: "alice",
  tag: "sha-abc1234",
  domain: "blog.alice.example"
};

describe("buildSelfHostBundle", () => {
  it("carries exactly the files a deployment needs", () => {
    const names = buildSelfHostBundle(INPUT).map((f) => f.name);
    expect(names).toEqual(["README.md", "config.json", "docker-compose.yml", ".env", "Caddyfile"]);
  });

  it("pins the image tag in the env file, and the compose file demands it", () => {
    const files = buildSelfHostBundle(INPUT);
    const env = files.find((f) => f.name === ".env")!.content;
    const compose = files.find((f) => f.name === "docker-compose.yml")!.content;

    expect(env).toContain("TAG=sha-abc1234");
    // A moving tag silently changes what a deployment runs, so the compose
    // file requires the pin rather than defaulting to one.
    expect(compose).toContain("${TAG:?");
    expect(compose).not.toMatch(/image:\s*ecency\/self-hosted:(latest|develop)\b/);
    // Nothing to build: the recipient has no monorepo.
    expect(compose).not.toContain("build:");
  });

  it("keeps the SEO mounts commented, since the files do not exist yet", () => {
    const compose = buildSelfHostBundle(INPUT).find((f) => f.name === "docker-compose.yml")!.content;
    for (const file of ["robots.txt", "sitemap.xml", "rss.xml"]) {
      // Docker creates a DIRECTORY for a missing source, which would replace
      // the working robots.txt the image ships with an unservable directory.
      expect(compose).toMatch(new RegExp(`#\\s*-\\s*\\./seo/${file.replace(".", "\\.")}`));
    }
  });

  it("writes the owner's config verbatim, as valid JSON", () => {
    const written = buildSelfHostBundle(INPUT).find((f) => f.name === "config.json")!.content;
    expect(JSON.parse(written)).toEqual(INPUT.config);
  });

  it("uses the owner's domain everywhere when they gave one", () => {
    const files = buildSelfHostBundle(INPUT);
    const caddy = files.find((f) => f.name === "Caddyfile")!.content;
    const readme = files.find((f) => f.name === "README.md")!.content;

    expect(caddy).toContain("blog.alice.example {");
    expect(caddy).toContain("reverse_proxy 127.0.0.1:3000");
    expect(readme).toContain("https://blog.alice.example/rss.xml");
    expect(readme).not.toContain("blog.example.com");
  });

  it("names the OWNER as the editor account, not the site's own name", () => {
    // On a community instance the username is the keyless hive-NNNNN
    // account: telling the reader to sign in as that account sends them to
    // an account nobody holds keys for.
    const readme = buildSelfHostBundle({
      ...INPUT,
      username: "hive-125125",
      owner: "alice"
    }).find((f) => f.name === "README.md")!.content;

    expect(readme).toContain("sign in as\n@alice");
    expect(readme).not.toContain("@hive-125125 and open it");
  });

  it("falls back to the username as owner for a personal blog", () => {
    const readme = buildSelfHostBundle(INPUT).find((f) => f.name === "README.md")!.content;
    expect(readme).toContain("@alice");
  });

  it("writes one port into the compose file, the env file and the Caddyfile", () => {
    // Generated apart, a changed port means Caddy proxying to nothing, so
    // the three have to come from the same value.
    const files = buildSelfHostBundle(INPUT);
    const env = files.find((f) => f.name === ".env")!.content;
    const caddy = files.find((f) => f.name === "Caddyfile")!.content;
    const compose = files.find((f) => f.name === "docker-compose.yml")!.content;

    expect(env).toContain("PORT=3000");
    expect(caddy).toContain("reverse_proxy 127.0.0.1:3000");
    expect(compose).toContain("${PORT:-3000}");
    // Each edit site points at the other, since only a later edit can split them.
    expect(env).toMatch(/Caddyfile/);
    expect(caddy).toMatch(/PORT in \.env/);
  });

  it("warns about the placeholder everywhere it appears, not just the Caddyfile", () => {
    const readme = buildSelfHostBundle({ ...INPUT, domain: undefined }).find(
      (f) => f.name === "README.md"
    )!.content;

    // The SEO commands carry the placeholder too, and run as written they
    // publish a sitemap and feed advertising an example site.
    const seoSection = readme.slice(readme.indexOf("## Search engines"));
    expect(seoSection).toContain(EXAMPLE_DOMAIN);
    expect(seoSection).toMatch(/Set your own\s+domain in the two commands below first/);
    // And the top of the file says it once, plainly.
    expect(readme).toContain(`**${EXAMPLE_DOMAIN} in these files is a placeholder.**`);
  });

  it("says nothing about placeholders when a domain was given", () => {
    const readme = buildSelfHostBundle(INPUT).find((f) => f.name === "README.md")!.content;
    expect(readme).not.toContain("placeholder");
    expect(readme).not.toContain(EXAMPLE_DOMAIN);
  });

  it("normalizes a pasted URL down to its hostname", () => {
    // People paste the address bar. Used raw, this produced README links
    // like https://https://blog.alice.example/rss.xml.
    for (const typed of [
      "https://blog.alice.example",
      "https://blog.alice.example/",
      "http://blog.alice.example/path?x=1",
      "  BLOG.Alice.Example  "
    ]) {
      expect(normalizeDomain(typed), typed).toBe("blog.alice.example");
    }
  });

  it("refuses anything that is not a hostname, including injection attempts", () => {
    for (const typed of [
      "",
      "   ",
      "not a domain",
      "localhost",
      "javascript:alert(1)",
      // A newline would have written extra directives into the Caddyfile,
      // where every line is a directive.
      "blog.alice.example\nrespond /admin 200",
      "blog.alice.example {\n  respond 200\n}"
    ]) {
      expect(normalizeDomain(typed), JSON.stringify(typed)).toBeNull();
    }
  });

  it("never lets an unusable domain reach the generated files", () => {
    const files = buildSelfHostBundle({
      ...INPUT,
      domain: "blog.alice.example\nrespond /admin 200"
    });
    const caddy = files.find((f) => f.name === "Caddyfile")!.content;
    expect(caddy).not.toContain("respond");
    expect(caddy).toContain("blog.example.com {");
  });

  it("falls back to a placeholder domain and says so when they did not", () => {
    const files = buildSelfHostBundle({ ...INPUT, domain: "   " });
    const caddy = files.find((f) => f.name === "Caddyfile")!.content;
    const readme = files.find((f) => f.name === "README.md")!.content;

    expect(caddy).toContain("blog.example.com {");
    // The README must tell them to replace it rather than leave it working-looking.
    expect(readme).toContain("replace");
    expect(readme).toContain("blog.example.com");
  });
});

describe("zipStore", () => {
  it("produces an archive whose every entry passes its own CRC", () => {
    const zip = buildSelfHostZip(INPUT, new Date("2026-08-12T21:45:00Z"));
    const entries = readZip(zip);

    expect(entries.map((e) => e.name)).toEqual([
      "README.md",
      "config.json",
      "docker-compose.yml",
      ".env",
      "Caddyfile"
    ]);
    for (const entry of entries) {
      expect(entry.crcOk, `${entry.name} CRC`).toBe(true);
    }
    expect(JSON.parse(entries.find((e) => e.name === "config.json")!.content)).toEqual(INPUT.config);
  });

  it("round-trips content that byte counting would get wrong", () => {
    // A multi-byte character makes the UTF-8 length differ from the string
    // length: sizes in the headers are BYTES, and an extractor that trusts
    // them would truncate the last entry if this were counted as characters.
    const files = [
      { name: "unicode.txt", content: "héllo wörld — ünïcode ✓\n" },
      { name: "after.txt", content: "must survive intact" }
    ];
    const entries = readZip(zipStore(files, new Date("2026-08-12T00:00:00Z")));

    expect(entries.map((e) => e.content)).toEqual(files.map((f) => f.content));
    expect(entries.every((e) => e.crcOk)).toBe(true);
  });

  it("is deterministic for the same files and timestamp", () => {
    const at = new Date("2026-08-12T21:45:00Z");
    expect(Array.from(buildSelfHostZip(INPUT, at))).toEqual(Array.from(buildSelfHostZip(INPUT, at)));
  });

  it("writes an empty archive without corrupting the trailer", () => {
    const zip = zipStore([], new Date("2026-08-12T00:00:00Z"));
    expect(zip.length).toBe(22);
    expect(readZip(zip)).toEqual([]);
  });
});
