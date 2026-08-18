import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The newsletter feature is decided at request time in the Next.js server
 * (server/newsletter-internal.ts reads NEWSLETTER_API_URL + NEWSLETTER_SERVICE_TOKEN),
 * so the deploy wiring must hand both variables to the `web` service, and the
 * deploy jobs must forward them. #1523 first put them under `vapi`, which is
 * silent: nothing fails, the controls simply never render. This pins the wiring.
 */
const root = join(__dirname, "..", "..", "..", "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const VARS = ["NEWSLETTER_API_URL", "NEWSLETTER_SERVICE_TOKEN"];

/** The lines of one top-level service block in a compose file (2-space keys under `services:`). */
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

const envEntries = (block: string) => block.split("\n").filter((l) => /^      - [A-Z_]+/.test(l)).map((l) => l.trim().slice(2));

describe("newsletter deploy wiring", () => {
  it.each(["apps/web/docker-compose.yml", "apps/web/docker-compose.production.yml"])(
    "%s passes both variables to the web service and to nothing else",
    (file) => {
      const compose = read(file);
      const web = envEntries(serviceBlock(compose, "web"));
      for (const v of VARS) expect(web, `${file}: web.environment lacks ${v}`).toContain(v);
      const vapi = envEntries(serviceBlock(compose, "vapi"));
      for (const v of VARS) expect(vapi, `${file}: ${v} does not belong to vapi`).not.toContain(v);
    }
  );

  it.each([".github/workflows/master.yml", ".github/workflows/staging.yml"])("%s forwards both variables in every deploy job", (file) => {
    const wf = read(file);
    // Every ssh-action step that deploys the stack carries an `envs:` list; each must forward both.
    const envsLines = wf.split("\n").filter((l) => /^\s+envs:\s/.test(l));
    expect(envsLines.length).toBeGreaterThan(0);
    for (const line of envsLines) for (const v of VARS) expect(line, `${file}: envs lacks ${v}`).toContain(v);
    for (const v of VARS) {
      expect(wf.match(new RegExp(`export ${v}=\\$${v}`, "g"))?.length ?? 0, `${file}: export ${v}`).toBe(envsLines.length);
    }
  });
});
