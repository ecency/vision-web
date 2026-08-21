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

function boot(env: NodeJS.ProcessEnv): Promise<{ port: number; stderr: () => string }> {
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

function get(port: number, path: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
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
function start(port: number, path: string) {
  let settle!: (r: { status: number; headers: http.IncomingHttpHeaders }) => void;
  const done = new Promise<{ status: number; headers: http.IncomingHttpHeaders }>((r) => (settle = r));
  const req = http.get({ host: "127.0.0.1", port, path }, (res) => {
    res.resume();
    res.on("end", () => settle({ status: res.statusCode ?? 0, headers: res.headers }));
  });
  req.on("error", () => settle({ status: 0, headers: {} }));
  return { done, abort: () => req.destroy() };
}

const settle = () => new Promise((r) => setTimeout(r, 150));

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

  it("never sheds static assets, API routes or the well-known files", async () => {
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
      "/robots.txt"
    ]) {
      expect((await get(port, path)).status, path).toBe(200);
    }
    // And a page is still shed while the slot is held.
    expect((await get(port, "/hot")).status).toBe(503);
    await get(port, "/api/release");
    await a.done;
  });

  it("does not count writes against the cap", async () => {
    const { port } = await boot({ SSR_MAX_INFLIGHT: "1" });
    const a = start(port, "/slow/doc");
    await settle();
    const status = await new Promise<number>((resolve, reject) => {
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

  it("frees the slot when the client goes away before the render finishes", async () => {
    const { port } = await boot({ SSR_MAX_INFLIGHT: "1" });
    const a = start(port, "/slow/abandoned");
    await settle();
    expect((await get(port, "/page")).status).toBe(503);
    a.abort();
    await settle();
    expect((await get(port, "/page")).status).toBe(200);
    await get(port, "/api/release");
  });

  it("is wired into the production image and the stack", () => {
    const dockerfile = readFileSync(join(process.cwd(), "Dockerfile"), "utf8");
    expect(dockerfile).toContain("ssr-admission.js ./apps/web/ssr-admission.js");
    expect(dockerfile).toMatch(/CMD \[.*"--require", "\.\/ssr-admission\.js".*\]/);
    const compose = readFileSync(join(process.cwd(), "docker-compose.production.yml"), "utf8");
    expect(compose).toMatch(/^\s*- SSR_MAX_INFLIGHT=\d+$/m);
  });
});
