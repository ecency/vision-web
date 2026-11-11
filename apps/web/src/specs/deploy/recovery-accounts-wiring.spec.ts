import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * vapi only serves self-serve recovery for the recovery accounts listed in
 * RECOVERY_ACCOUNTS and falls back to ecency alone when it is unset. The stack
 * deploy owns vapi's env, so a missing or bare entry here silently turns
 * recovery off for signup partners. Pin a literal value that keeps ecency.
 */
const SERVED = ["ecency", "appreciator", "good-karma", "esteemapp"];
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

describe("recovery accounts deploy wiring", () => {
  it.each(["apps/web/docker-compose.yml", "apps/web/docker-compose.production.yml"])(
    "%s gives vapi the literal RECOVERY_ACCOUNTS list of every served recovery account",
    (file) => {
      const entries = envEntries(serviceBlock(read(file), "vapi"));
      const entry = entries.find((e) => e.split("=")[0] === "RECOVERY_ACCOUNTS");
      expect(entry, `${file}: vapi RECOVERY_ACCOUNTS`).toBeDefined();
      const value = (entry ?? "").split("=")[1] ?? "";
      const accounts = value.split(",").map((n) => n.trim());
      // Every recovery account with a running recovery worker. Dropping or
      // mistyping one silently turns self-serve recovery off for its accounts.
      expect([...accounts].sort(), `${file}: literal list`).toEqual([...SERVED].sort());
    }
  );
});
