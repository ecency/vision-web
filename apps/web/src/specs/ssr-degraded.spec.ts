// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import http from "node:http";
import { join } from "node:path";

/**
 * The production image starts Next with `node --require ./ssr-degraded.js`
 * (see the Dockerfile). These tests boot the real preload in a child process
 * in front of a plain http server that behaves like a page render: the
 * Cache-Control and x-cache-tier the middleware decided are already set, then
 * the "render" runs through timers and promises before it writes, and calls
 * the preload's mark() where a prefetch would time out.
 */

const PRELOAD = join(process.cwd(), "ssr-degraded.js");

// ?mark=<ms> calls mark() after that delay (behind a setTimeout, a promise and
// a setImmediate, as a timed-out prefetch deep in a render would), ?end=<ms>
// ends the response after that delay, ?early=1 flushes the head first like a
// streamed shell. /api/state returns the preload's counters.
const CHILD_SERVER = `
  const http = require("http");
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // Outside any request: must neither throw nor count.
  globalThis.__ecencySsrDegraded.mark("startup");
  setTimeout(() => globalThis.__ecencySsrDegraded.mark("timer"), 0);
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/api/state") {
      res.end(JSON.stringify(globalThis.__ecencySsrDegraded.state));
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=3600");
    res.setHeader("x-cache-tier", "profile");
    if (url.searchParams.get("early")) res.write("<html>");
    const markAt = url.searchParams.get("mark");
    const marked = markAt === null ? Promise.resolve() : new Promise((done) => {
      setTimeout(() => {
        Promise.resolve().then(() => setImmediate(() => {
          globalThis.__ecencySsrDegraded.mark("prefetch-timeout");
          done();
        }));
      }, Number(markAt));
    });
    await marked;
    await wait(Number(url.searchParams.get("end") || 0));
    res.end("body");
  });
  server.listen(0, "127.0.0.1", () => process.stdout.write(String(server.address().port) + "\\n"));
`;

const children: ChildProcess[] = [];

type Reply = { status: number; headers: http.IncomingHttpHeaders; body: string };

function boot(preloads: string[] = [PRELOAD], env: NodeJS.ProcessEnv = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    const args = preloads.flatMap((p) => ["--require", p]);
    const child = spawn(process.execPath, [...args, "-e", CHILD_SERVER], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    children.push(child);
    let err = "";
    child.stderr!.on("data", (d) => (err += String(d)));
    child.stdout!.once("data", (d) => resolve(Number(String(d).trim())));
    child.once("exit", (code) => reject(new Error(`child exited ${code}: ${err}`)));
  });
}

function get(port: number, path: string): Promise<Reply> {
  return new Promise<Reply>((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path }, (res) => {
      let body = "";
      res.on("data", (d) => (body += String(d)));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on("error", reject);
  });
}

afterEach(() => {
  for (const c of children.splice(0)) c.kill("SIGKILL");
});

describe("ssr-degraded preload", () => {
  it("leaves a render that did not time out exactly as the middleware set it", async () => {
    const port = await boot();
    const reply = await get(port, "/@someone/posts");
    expect(reply.status).toBe(200);
    expect(reply.headers["cache-control"]).toBe(
      "public, max-age=0, s-maxage=300, stale-while-revalidate=3600"
    );
    expect(reply.headers["x-cache-tier"]).toBe("profile");
  });

  it("sends a render that timed out as private, no-store and tags its tier", async () => {
    const port = await boot();
    const reply = await get(port, "/@someone/posts?mark=20");
    expect(reply.status).toBe(200);
    expect(reply.body).toBe("body");
    expect(reply.headers["cache-control"]).toBe("private, no-store");
    expect(reply.headers["x-cache-tier"]).toBe("profile-degraded");
    expect(JSON.parse((await get(port, "/api/state")).body)).toEqual({ degraded: 1, late: 0 });
  });

  it("flags only the request the timeout ran under, not one rendering beside it", async () => {
    const port = await boot();
    const pause = () => new Promise((r) => setTimeout(r, 30));
    // Both orders: a clean render in flight for the whole time the other is
    // marked, and a clean render that arrived after the one that times out.
    const cleanFirst = get(port, "/@other/posts?end=250");
    await pause();
    const degradedSecond = get(port, "/@someone/posts?mark=60");
    const degradedFirst = get(port, "/@someone/posts?mark=120");
    await pause();
    const cleanSecond = get(port, "/@other/posts?end=250");
    const replies = await Promise.all([cleanFirst, degradedSecond, degradedFirst, cleanSecond]);
    const [c1, d2, d1, c2] = replies.map((r) => r.headers["cache-control"]);
    expect(d1).toBe("private, no-store");
    expect(d2).toBe("private, no-store");
    expect(c1).toBe("public, max-age=0, s-maxage=300, stale-while-revalidate=3600");
    expect(c2).toBe("public, max-age=0, s-maxage=300, stale-while-revalidate=3600");
    expect(replies[0].headers["x-cache-tier"]).toBe("profile");
    expect(replies[3].headers["x-cache-tier"]).toBe("profile");
  });

  it("counts a timeout after the head was flushed as late and leaves that response alone", async () => {
    const port = await boot();
    const reply = await get(port, "/@someone/posts?early=1&mark=20");
    expect(reply.status).toBe(200);
    expect(reply.body).toBe("<html>body");
    expect(reply.headers["cache-control"]).toContain("s-maxage=300");
    expect(JSON.parse((await get(port, "/api/state")).body)).toEqual({ degraded: 0, late: 1 });
  });

  it("is a no-op outside any request", async () => {
    const port = await boot();
    // The child calls mark() at startup and from a module-level timer, with
    // no request to flag; the process must keep serving and count nothing.
    expect((await get(port, "/@someone/posts")).headers["cache-control"]).toContain("public");
    expect(JSON.parse((await get(port, "/api/state")).body)).toEqual({ degraded: 0, late: 0 });
  });

  it("runs behind ssr-admission in the image's order without changing what either does", async () => {
    const port = await boot([join(process.cwd(), "ssr-admission.js"), PRELOAD], {
      SSR_MAX_INFLIGHT: "1"
    });
    const parked = get(port, "/@someone/posts?mark=20&end=200");
    await new Promise((r) => setTimeout(r, 80));
    const shed = await get(port, "/@other/posts");
    expect(shed.status).toBe(503);
    expect(shed.headers["cache-control"]).toBe("no-store");
    const degraded = await parked;
    expect(degraded.headers["cache-control"]).toBe("private, no-store");
    expect(degraded.headers["x-cache-tier"]).toBe("profile-degraded");
  });

  it("is loaded by the production image", () => {
    const dockerfile = readFileSync(join(process.cwd(), "Dockerfile"), "utf8");
    expect(dockerfile).toContain("ssr-degraded.js ./apps/web/ssr-degraded.js");
    expect(dockerfile).toMatch(
      /CMD \[.*"--require", "\.\/ssr-admission\.js", "--require", "\.\/ssr-degraded\.js".*\]/
    );
  });
});
