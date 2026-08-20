// Origin nginx config audit (infra/origin/README.md).
//
// This repository is PUBLIC, so committed origin config may carry structure but
// never numbers or addresses. Each rule exists because the thing it forbids is a
// real disclosure: a source address names infrastructure that sits behind
// Cloudflare precisely so it is not named; an inline allowlist publishes who is
// trusted, which is the entire value of an allowlist; a threshold says where the
// limit is and how to sit under it. Those belong in an /etc/nginx include that
// is not in git, so a missing file fails closed.
//
// COMMENTS ARE AUDITED TOO. An earlier version stripped them before applying
// every rule, which let the exact rates through in prose while the audit
// reported a clean run. A comment in a public repository is published.
//
// Deliberately allowed: loopback proxy targets, which nothing off-box can
// reach and which the blog-hosting origin already commits; `burst=`, which is
// meaningless without the rate it bursts against; and a bare `deny all`, which
// is the closing half of the documented fail-closed pattern.
//
// CI runs with --fail: any finding exits 1.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const AUDITED = join(ROOT, "infra");
const FAIL = process.argv.includes("--fail");

/** Every .conf under infra/, at any depth, so a new subdirectory is covered. */
function configs(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...configs(full));
    else if (entry.name.endsWith(".conf")) out.push(full);
  }
  return out;
}

const withoutLoopback = (text) => text.replace(/\b127\.0\.0\.1\b/g, "").replace(/\[::1\]|(?<![\w:])::1(?![\w:])/g, "");

const RULES = [
  {
    id: "source-address",
    // IPv4 and IPv6. An IPv6 literal is just as much an origin address, and the
    // first version of this audit saw only dotted quads.
    test: (line) =>
      /\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(withoutLoopback(line)) ||
      /(?:[0-9a-f]{1,4}:){2,}[0-9a-f]{1,4}\b/i.test(withoutLoopback(line)),
    why: "names a source address; move it to an /etc/nginx include that is not in git"
  },
  {
    id: "inline-allowlist",
    // `deny all` is permitted on purpose: the documented pattern is
    // `include /etc/nginx/<name>-allow*.conf;` followed by `deny all;`, so
    // rejecting the closing line would reject the remediation itself.
    test: (line) => /^\s*(?:allow|deny)\s+(?!all\s*;)\S/.test(line),
    why: "inlines an allowlist entry; use `include /etc/nginx/<name>-allow*.conf;` then `deny all;` so a missing file fails closed"
  },
  {
    id: "threshold",
    // Rates, zone definitions and connection ceilings, in directives OR prose.
    test: (line) =>
      /\b\d+\s*(?:r\/[sm]\b|req\/s\b|requests?\/s(?:ec)?\b)/i.test(line) ||
      /^\s*limit_req_zone\s/.test(line) ||
      /^\s*limit_conn\s+\S+\s+\d+/.test(line),
    why: "states a threshold; these live in /etc/nginx/{rate-limits,conn-limits}.conf, which are not in git"
  },
  {
    id: "secret-marker",
    test: (line) => /EcencyInfraMonitor|api[_-]?key|password|Bearer\s|secret[_-]?key/i.test(line),
    why: "looks like a credential or a secret marker"
  }
];

// A guard that cannot be shown to fire is not a guard. --self-test runs every
// rule against a planted violation and against the pattern each rule must NOT
// reject, and fails if any rule has gone quiet. CI runs it beside the audit, so
// a regex edited into uselessness is caught in the same step that relies on it.
if (process.argv.includes("--self-test")) {
  const MUST_FIRE = [
    ["source-address", "        proxy_pass http://203.0.113.9:8080;"],
    ["source-address", "        allow 2001:db8:aaaa::42;"],
    ["inline-allowlist", "        allow 198.51.100.7;"],
    ["threshold", "        # SSR page rate limit: 15 req/s per client IP"],
    ["threshold", "        limit_req_zone $x zone=y:1m rate=7r/s;"],
    ["threshold", "        limit_conn total_ssr 150;"],
    ["secret-marker", "        # TODO remove api_key=hunter2 before shipping"]
  ];
  // Committed today and legitimate: a false positive here breaks the repo.
  const MUST_NOT_FIRE = [
    "        proxy_pass         http://127.0.0.1:3000;",
    "        limit_req zone=ssrlimit burst=50 nodelay;",
    "        include /etc/nginx/foo-allow*.conf;",
    "        deny all;",
    "        include /etc/nginx/rate-limits*.conf;"
  ];
  const failures = [];
  for (const [id, line] of MUST_FIRE) {
    const rule = RULES.find((r) => r.id === id);
    if (!rule.test(line)) failures.push(`rule ${id} did NOT fire on: ${line.trim()}`);
  }
  for (const line of MUST_NOT_FIRE) {
    for (const rule of RULES) {
      if (rule.test(line)) failures.push(`rule ${rule.id} wrongly fired on: ${line.trim()}`);
    }
  }
  failures.forEach((f) => console.error(`origin-config-audit self-test: ${f}`));
  console.log(`origin-config-audit self-test: ${failures.length} failure(s), ${MUST_FIRE.length + MUST_NOT_FIRE.length} case(s)`);
  process.exit(failures.length > 0 ? 1 : 0);
}

let files;
try {
  files = configs(AUDITED);
} catch (err) {
  // A missing directory is a finding, not a pass. The previous version exited 0
  // here, so deleting the audited tree left CI green while the contract it
  // enforces silently stopped existing.
  console.error(`origin-config-audit: cannot read ${relative(ROOT, AUDITED)}: ${err.code ?? err.message}`);
  console.error("  If infra/ moved, update AUDITED in this script in the same commit.");
  process.exit(FAIL ? 1 : 0);
}

if (files.length === 0) {
  console.error(`origin-config-audit: no .conf files under ${relative(ROOT, AUDITED)}; did they move?`);
  process.exit(FAIL ? 1 : 0);
}

const findings = [];
for (const file of files) {
  if (!statSync(file).isFile()) continue;
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((text, i) => {
      if (text.trim().length === 0) return;
      for (const rule of RULES) {
        if (rule.test(text)) {
          findings.push({ file: relative(ROOT, file), line: i + 1, rule: rule.id, why: rule.why, text: text.trim() });
        }
      }
    });
}

for (const f of findings) {
  console.error(`${f.file}:${f.line}  [${f.rule}] ${f.why}`);
  console.error(`    ${f.text}`);
}
console.log(`origin-config-audit: ${findings.length} finding(s) in ${files.length} file(s)`);
if (findings.length > 0 && FAIL) process.exit(1);
