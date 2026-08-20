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

  /**
   * The bot check on anonymous subscribes reads TURNSTILE_SECRET in the Next tier
   * (server/turnstile-verify). It was already declared for `vapi`, which does the Stripe
   * flow, and a missing copy on `web` fails in the quietest possible way: an unset secret
   * relays instead of refusing, deliberately, so that nothing takes signups down during a
   * deploy -- which also means the check would simply be off and nobody would notice.
   *
   * Unlike the two variables above, this one is SHARED: vapi legitimately needs it too,
   * so this asserts presence on web without asserting absence on vapi.
   */
  it.each(["apps/web/docker-compose.yml", "apps/web/docker-compose.production.yml"])(
    "%s hands the Turnstile secret to the web service, not only to vapi",
    (file) => {
      const web = envEntries(serviceBlock(read(file), "web"));
      expect(web, `${file}: web.environment lacks TURNSTILE_SECRET`).toContain("TURNSTILE_SECRET");
    }
  );

  /**
   * NEXT_PUBLIC_* is inlined by Next at BUILD time, so the sitekey has to reach the image
   * build, not the runtime environment. Without the ARG every deployed client silently
   * falls back to the literal in features/shared/turnstile.tsx, which is correct today and
   * would be wrong the moment the widget is rotated or a staging-specific one is used.
   */
  it("the Dockerfile accepts the public sitekey as a build argument", () => {
    const dockerfile = read("apps/web/Dockerfile");
    expect(dockerfile).toMatch(/^ARG NEXT_PUBLIC_TURNSTILE_SITEKEY$/m);
    expect(dockerfile).toMatch(/^ENV NEXT_PUBLIC_TURNSTILE_SITEKEY=\$\{NEXT_PUBLIC_TURNSTILE_SITEKEY\}$/m);
  });

  it.each([".github/workflows/master.yml", ".github/workflows/staging.yml"])(
    "%s passes the public sitekey into the image build",
    (file) => {
      expect(read(file)).toContain("NEXT_PUBLIC_TURNSTILE_SITEKEY=${{ secrets.TURNSTILE_SITEKEY }}");
    }
  );

  it.each([".github/workflows/master.yml", ".github/workflows/staging.yml"])(
    "%s forwards the Turnstile secret in every deploy job",
    (file) => {
      const wf = read(file);
      const envsLines = wf.split("\n").filter((l) => /^\s+envs:\s/.test(l));
      expect(envsLines.length).toBeGreaterThan(0);
      for (const line of envsLines) {
        expect(line, `${file}: envs lacks TURNSTILE_SECRET`).toContain("TURNSTILE_SECRET");
      }
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
