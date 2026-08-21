import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The server-side RPC proxy is decided at process start in core/sdk-init.ts
 * from SSR_RPC_PROXY, SSR_INTERNAL_SECRET and INTERNAL_API_HOST, and vapi only
 * switches its side on when it holds the same secret. A variable missing from
 * any one of these places is silent: the SDK simply keeps going to the node
 * pool. This pins the whole chain: both services in both stack files, the
 * deploy jobs forwarding the secret, and the origin proxy hiding the path.
 */
const root = join(__dirname, "..", "..", "..", "..", "..");
const read = (p: string): string => readFileSync(join(root, p), "utf8");

function serviceBlock(compose: string, name: string): string {
  const lines = compose.split("\n");
  const start = lines.findIndex((l) => l === `  ${name}:`);
  if (start < 0) throw new Error(`service ${name} not found`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^  [A-Za-z_-]+:/.test(lines[i]) || /^[A-Za-z_-]+:/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

const envEntries = (block: string): string[] =>
  block.split("\n").filter((l) => /^      - [A-Z_]+/.test(l)).map((l) => l.trim().slice(2));
const envNames = (entries: string[]): string[] => entries.map((e) => e.split("=")[0]);

describe("ssr rpc proxy deploy wiring", () => {
  it.each(["apps/web/docker-compose.yml", "apps/web/docker-compose.production.yml"])(
    "%s hands the secret to vapi and to web, and web carries the switch",
    (file) => {
      const compose = read(file);
      expect(envEntries(serviceBlock(compose, "vapi")), `${file}: vapi`).toContain("SSR_INTERNAL_SECRET");
      const web = envEntries(serviceBlock(compose, "web"));
      expect(envNames(web), `${file}: web`).toContain("SSR_INTERNAL_SECRET");
      expect(web.some((e) => e === "SSR_RPC_PROXY=0" || e === "SSR_RPC_PROXY=1"), `${file}: web switch`).toBe(true);
    }
  );

  it("alpha has the switch on and requires the secret; production carries an explicit value, never a bare passthrough", () => {
    const alpha = envEntries(serviceBlock(read("apps/web/docker-compose.yml"), "web"));
    expect(alpha).toContain("SSR_RPC_PROXY=1");
    expect(alpha.some((e) => /^SSR_INTERNAL_SECRET=\$\{SSR_INTERNAL_SECRET:\?/.test(e))).toBe(true);
    const prod = envEntries(serviceBlock(read("apps/web/docker-compose.production.yml"), "web"));
    expect(prod).not.toContain("SSR_RPC_PROXY");
    expect(prod.some((e) => /^SSR_RPC_PROXY=[01]$/.test(e))).toBe(true);
  });

  it.each(["master.yml", "staging.yml"])(".github/workflows/%s forwards the secret end to end", (file) => {
    const wf = read(`.github/workflows/${file}`);
    const steps = wf.split("appleboy/ssh-action").length - 1;
    expect(steps).toBeGreaterThan(0);
    expect(wf.match(/SSR_INTERNAL_SECRET: \$\{\{secrets\.SSR_INTERNAL_SECRET\}\}/g)?.length, `${file}: env`).toBe(steps);
    expect(wf.match(/envs: [^\n]*SSR_INTERNAL_SECRET/g)?.length, `${file}: envs`).toBe(steps);
    expect(wf.match(/export SSR_INTERNAL_SECRET=\$SSR_INTERNAL_SECRET/g)?.length, `${file}: export`).toBe(steps);
  });

  it.each(["infra/origin/eu.ecency.com.conf", "infra/origin/us.ecency.com.conf"])(
    "%s hides the proxy path from outside, ahead of the generic private-api location",
    (file) => {
      const conf = read(file);
      const hidden = conf.indexOf("location ~ ^/private-api/ssr/");
      const generic = conf.indexOf("location ~ ^/(private-api|search-api|wallet-api|auth-api)");
      expect(hidden, `${file}: location`).toBeGreaterThan(-1);
      expect(hidden, `${file}: order`).toBeLessThan(generic);
      expect(conf.slice(hidden, generic)).toContain("return 404;");
    }
  );
});
