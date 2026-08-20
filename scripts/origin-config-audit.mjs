// Origin nginx config audit (infra/origin/README.md).
// This repository is PUBLIC, so committed origin config may carry structure but
// never numbers or addresses. Each rule exists because the thing it forbids is a
// real disclosure: a source address names infrastructure that sits behind
// Cloudflare precisely so it is not named; an inline allow/deny publishes who is
// trusted, which is the entire value of an allowlist; a rate says where the
// limit is and how to sit under it. Those all belong in an /etc/nginx include
// that is not in git, so a missing file fails closed.
// Loopback proxy targets and `burst=` are deliberately allowed: nothing off-box
// reaches a loopback port, and a burst is meaningless without its rate.
// CI runs with --fail: any finding exits 1.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const DIR = join(ROOT, "infra", "origin");
const FAIL = process.argv.includes("--fail");

/** Non-comment, non-blank lines: a rule about content must not fire on prose. */
const directivesOf = (source) =>
  source
    .split("\n")
    .map((line, i) => ({ n: i + 1, text: line.trim() }))
    .filter(({ text }) => text.length > 0 && !text.startsWith("#"));

const RULES = [
  {
    id: "source-address",
    test: ({ text }) => /\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(text.replace(/\b127\.0\.0\.1\b/g, "")),
    why: "names a source address; move it to an /etc/nginx include that is not in git"
  },
  {
    id: "inline-allowlist",
    test: ({ text }) => /^(?:allow|deny)\s/.test(text),
    why: "inlines an allowlist; use `include /etc/nginx/<name>-allow*.conf;` then `deny all` so a missing file fails closed"
  },
  {
    id: "rate",
    test: ({ text }) => /\b\d+r\/[sm]\b/.test(text) || /^limit_req_zone\s/.test(text),
    why: "states a rate; thresholds live in /etc/nginx/rate-limits.conf, which is not in git"
  },
  {
    id: "secret-marker",
    test: ({ text }) => /EcencyInfraMonitor|api[_-]?key|password|Bearer\s/i.test(text),
    why: "looks like a credential or a secret marker"
  }
];

let files;
try {
  files = readdirSync(DIR).filter((f) => f.endsWith(".conf"));
} catch {
  console.log("origin-config-audit: no infra/origin directory, nothing to check");
  process.exit(0);
}

if (files.length === 0) {
  // Vacuous-pass guard: the directory exists but holds nothing to audit.
  console.error("origin-config-audit: infra/origin has no .conf files; did they move?");
  process.exit(FAIL ? 1 : 0);
}

const findings = [];
for (const file of files) {
  for (const line of directivesOf(readFileSync(join(DIR, file), "utf8"))) {
    for (const rule of RULES) {
      if (rule.test(line)) {
        findings.push({ file: relative(ROOT, join(DIR, file)), line: line.n, rule: rule.id, why: rule.why, text: line.text });
      }
    }
  }
}

for (const f of findings) {
  console.error(`${f.file}:${f.line}  [${f.rule}] ${f.why}`);
  console.error(`    ${f.text}`);
}
console.log(`origin-config-audit: ${findings.length} finding(s) in ${files.length} file(s)`);
if (findings.length > 0 && FAIL) process.exit(1);
