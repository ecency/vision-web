// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import http from "node:http";
import { join } from "node:path";

/**
 * The production image starts Next with `node --require ./ssr-admission.js`
 * (see the Dockerfile). These tests boot the real preload in a child process
 * in front of a plain http server whose handler holds each page render open
 * until told to finish, then drive it over real sockets: that is the same
 * 'request' emission the preload intercepts for `next start`.
 */

const PRELOAD = join(process.cwd(), "ssr-admission.js");

// The child: a server that parks /slow renders until /api/release is called
// (an /api/ path, so the preload never counts or sheds the control call itself),
// and answers everything else straight away. Prints its port on stdout.
const CHILD_SERVER = `
  const http = require("http");
  const parked = [];
  const server = http.createServer((req, res) => {
    const path = req.url.split("?")[0];
    if (path === "/api/release") {
      const n = parked.length;
      for (const r of parked.splice(0)) r.end("released");
      res.end(String(n));
      return;
    }
    if (path.startsWith("/slow")) {
      parked.push(res);
      return;
    }
    res.end("ok " + path);
  });
  server.listen(0, "127.0.0.1", () => process.stdout.write(String(server.address().port) + "\\n"));
`;

const children: ChildProcess[] = [];

type Booted = { port: number; stderr: () => string };
type Reply = { status: number; headers: http.IncomingHttpHeaders; body: string };
type Started = { done: Promise<{ status: number; headers: http.IncomingHttpHeaders }>; abort: () => void };

function boot(env: NodeJS.ProcessEnv): Promise<Booted> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--require", PRELOAD, "-e", CHILD_SERVER], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    children.push(child);
    let err = "";
    child.stderr!.on("data", (d) => (err += String(d)));
    child.stdout!.once("data", (d) => resolve({ port: Number(String(d).trim()), stderr: () => err }));
    child.once("exit", (code) => reject(new Error(`child exited ${code}: ${err}`)));
  });
}

function get(port: number, path: string, headers: Record<string, string> = {}): Promise<Reply> {
  return new Promise<Reply>((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path, headers }, (res) => {
      let body = "";
      res.on("data", (d) => (body += String(d)));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on("error", reject);
  });
}

// Start a request and resolve once it is on the wire (the server has parked
// it) without waiting for the response.
function start(port: number, path: string): Started {
  let settle!: (r: { status: number; headers: http.IncomingHttpHeaders }) => void;
  const done = new Promise<{ status: number; headers: http.IncomingHttpHeaders }>((r) => (settle = r));
  const req = http.get({ host: "127.0.0.1", port, path }, (res) => {
    res.resume();
    res.on("end", () => settle({ status: res.statusCode ?? 0, headers: res.headers }));
  });
  req.on("error", () => settle({ status: 0, headers: {} }));
  return { done, abort: () => req.destroy() };
}

const settle = (ms = 150): Promise<void> => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
  for (const c of children.splice(0)) c.kill("SIGKILL");
});

describe("ssr-admission preload", () => {
  it("is inert without SSR_MAX_INFLIGHT", async () => {
    const { port, stderr } = await boot({ SSR_MAX_INFLIGHT: "" });
    const a = start(port, "/slow/1");
    const b = start(port, "/slow/2");
    await settle();
    expect((await get(port, "/page")).status).toBe(200);
    await get(port, "/api/release");
    expect((await a.done).status).toBe(200);
    expect((await b.done).status).toBe(200);
    expect(stderr()).toContain("disabled");
  });

  it("answers 503 with Retry-After above the cap and frees the slot when a render finishes", async () => {
    const { port } = await boot({ SSR_MAX_INFLIGHT: "2", SSR_SHED_RETRY_AFTER: "3" });
    const a = start(port, "/slow/1");
    const b = start(port, "/slow/2");
    await settle();

    const shed = await get(port, "/@someone/some-post");
    expect(shed.status).toBe(503);
    expect(shed.headers["retry-after"]).toBe("3");
    expect(shed.headers["cache-control"]).toBe("no-store");

    // The parked renders were never touched by the shed.
    expect((await get(port, "/api/release")).body).toBe("2");
    expect((await a.done).status).toBe(200);
    expect((await b.done).status).toBe(200);

    // Slots are free again.
    expect((await get(port, "/@someone/some-post")).status).toBe(200);
  });

  it("counts RSC navigations as renders too", async () => {
    const { port } = await boot({ SSR_MAX_INFLIGHT: "1" });
    const a = start(port, "/slow/doc");
    await settle();
    expect((await get(port, "/trending?_rsc=abc12")).status).toBe(503);
    await get(port, "/api/release");
    await a.done;
  });

  it("never sheds the named static paths, and counts everything else including file-like entry routes", async () => {
    const { port } = await boot({ SSR_MAX_INFLIGHT: "1" });
    const a = start(port, "/slow/doc");
    await settle();
    for (const path of [
      "/_next/static/chunks/app.js",
      "/api/healthcheck",
      "/api/mattermost/channels",
      "/assets/noimage.png",
      "/scripts/x.js",
      "/favicon.ico",
      "/manifest.json",
      "/robots.txt",
      "/sw.js",
      "/firebase-messaging-sw.js",
      "/og.jpg",
      "/geo/cities.min.json",
      "/dmca/dmca-accounts.json",
      "/.well-known/assetlinks.json",
      "/public-nodes.json",
      "/apple-app-site-association",
      "/llms.txt",
      "/sitemap.xml",
      "/sitemap/posts-1.xml",
      "/assets/fonts/inter.woff2",
      "/_next/static/media/inter.woff2"
    ]) {
      expect((await get(port, path)).status, path).toBe(200);
    }
    // Everything that renders on the loop is shed while the slot is held: a
    // page, a dotted username, an RSS feed, the agent routes (rewritten from
    // .md/.json/.discussion.json) and an unknown data-looking path.
    for (const path of [
      "/hot",
      "/@demo.com",
      "/@someone/rss.xml",
      "/@someone/rss",
      "/created/photography/rss.xml",
      "/@someone/some-post.md",
      "/@someone/some-post.json",
      "/@someone/some-post.discussion.json",
      "/@demo/post.png",
      "/@demo/post.js",
      "/@demo.com/avatar.jpg",
      "/feed.xml",
      "/notes.txt",
      "/logo.png"
    ]) {
      expect((await get(port, path)).status, path).toBe(503);
    }
    await get(port, "/api/release");
    await a.done;
  });

  it("does not count writes against the cap", async () => {
    const { port } = await boot({ SSR_MAX_INFLIGHT: "1" });
    const a = start(port, "/slow/doc");
    await settle();
    const status: number = await new Promise<number>((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port, path: "/some-form", method: "POST" }, (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode ?? 0));
      });
      req.on("error", reject);
      req.end("x");
    });
    expect(status).toBe(200);
    await get(port, "/api/release");
    await a.done;
  });

  it("keeps the slot for the grace period after the client goes away, then frees it", async () => {
    const { port } = await boot({ SSR_MAX_INFLIGHT: "1", SSR_ABANDONED_GRACE_MS: "400" });
    const a = start(port, "/slow/abandoned");
    await settle();
    expect((await get(port, "/page")).status).toBe(503);
    a.abort();
    await settle();
    // The render is still running on the server; the slot is still held.
    expect((await get(port, "/page")).status).toBe(503);
    await settle(500);
    expect((await get(port, "/page")).status).toBe(200);
    await get(port, "/api/release");
  });

  it("frees the slot as soon as an abandoned render finishes, before the grace period ends", async () => {
    const { port } = await boot({ SSR_MAX_INFLIGHT: "1", SSR_ABANDONED_GRACE_MS: "5000" });
    const a = start(port, "/slow/abandoned");
    await settle();
    a.abort();
    await settle();
    expect((await get(port, "/page")).status).toBe(503);
    await get(port, "/api/release");
    await settle();
    expect((await get(port, "/page")).status).toBe(200);
  });

  it("ignores an invalid cap or Retry-After rather than crashing or silently misreporting", async () => {
    const bad = await boot({ SSR_MAX_INFLIGHT: "lots" });
    const a = start(bad.port, "/slow/1");
    await settle();
    expect((await get(bad.port, "/page")).status).toBe(200);
    expect(bad.stderr()).toContain("is not a positive number");
    await get(bad.port, "/api/release");
    await a.done;

    const odd = await boot({ SSR_MAX_INFLIGHT: "1", SSR_SHED_RETRY_AFTER: "2\r\nX-Injected: 1" });
    const b = start(odd.port, "/slow/1");
    await settle();
    const shed = await get(odd.port, "/page");
    expect(shed.status).toBe(503);
    expect(shed.headers["retry-after"]).toBe("1");
    expect(shed.headers["x-injected"]).toBeUndefined();
    await get(odd.port, "/api/release");
    await b.done;
  });

  it("is wired into the production image and the stack", () => {
    const dockerfile = readFileSync(join(process.cwd(), "Dockerfile"), "utf8");
    expect(dockerfile).toContain("ssr-admission.js ./apps/web/ssr-admission.js");
    expect(dockerfile).toMatch(/CMD \[.*"--require", "\.\/ssr-admission\.js".*\]/);
    // Under the web service specifically: a variable placed under another
    // service is silent (the preload just reports itself disabled).
    const webBlock = (compose: string): string => {
      const lines = compose.split("\n");
      const start = lines.findIndex((l) => l === "  web:");
      expect(start, "web service").toBeGreaterThan(-1);
      let end = lines.length;
      for (let i = start + 1; i < lines.length; i++) {
        if (/^  [A-Za-z_-]+:/.test(lines[i]) || /^[A-Za-z_-]+:/.test(lines[i])) {
          end = i;
          break;
        }
      }
      return lines.slice(start, end).join("\n");
    };
    for (const file of ["docker-compose.production.yml", "docker-compose.yml"]) {
      const web = webBlock(readFileSync(join(process.cwd(), file), "utf8"));
      expect(web, file).toMatch(/^\s*- SSR_MAX_INFLIGHT=\d+$/m);
      expect(web, file).toMatch(/^\s*- NODE_OPTIONS=.*--max-semi-space-size=\d+/m);
    }
  });
});
