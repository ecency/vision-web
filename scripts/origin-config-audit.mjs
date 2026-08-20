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
import { isIP } from "node:net";
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
    else if (entry.name.endsWith(".conf") || entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

/**
 * The tracked origin configs among everything collected. Separate from configs()
 * because the scan deliberately picks up documentation too, and the presence
 * guard must count origins rather than files: see its comment below.
 */
function originConfigsIn(files) {
  return files.filter((file) => file.endsWith(".conf"));
}

/**
 * Addresses in a line, found by tokenising and asking Node rather than by
 * pattern. A hand-rolled IPv6 regex missed every compressed form: `2001:db8::42`
 * and `fe80::1` both walked past the first version, and the self-test address
 * happened to match for an unrelated reason, which made the rule look alive
 * while it was half dead.
 */
function addressesIn(line) {
    const found = [];
    // Grab bracketed forms, CIDR suffixes and ports along with the address, then
    // peel them off, because each is what surrounds an address in nginx config.
    for (const raw of line.match(/\[?[0-9A-Fa-f:.]{2,}\]?(?::\d+)?(?:\/\d+)?/g) ?? []) {
        if (!raw.includes(":") && !raw.includes(".")) continue;
        const bare = raw.replace(/^\[/, "").replace(/\](?::\d+)?$/, "").replace(/\/\d+$/, "");
        // Try the most literal reading first. `2001:db8::` is itself a valid
        // address, so trailing colons are only trimmed if the raw form fails.
        const attempts = [bare, bare.replace(/[.,;]+$/, ""), bare.replace(/:\d+$/, "")];
        for (const attempt of attempts) {
            if (isIP(attempt)) {
                found.push(attempt);
                break;
            }
        }
    }
    return found;
}

/**
 * Addresses that disclose nothing: loopback, which names nothing reachable from
 * anywhere else, and the unspecified address, which is how `listen` says "every
 * interface" rather than naming a host.
 */
const NOT_A_DISCLOSURE = new Set(["127.0.0.1", "::1", "::", "0.0.0.0"]);

const RULES = [
  {
    id: "source-address",
    // IPv4 and IPv6. An IPv6 literal is just as much an origin address, and the
    // first version of this audit saw only dotted quads.
    test: (line) => addressesIn(line).some((addr) => !NOT_A_DISCLOSURE.has(addr)),
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
    id: "wildcard-protective-include",
    // nginx accepts a wildcard include that matches nothing, so wildcarding a
    // file that CARRIES a protective directive means a missing file reloads
    // clean with the protection simply gone. Allowlists may be wildcarded
    // because `deny all` outlives the file; these may not.
    // Not anchored to line start: the same instruction is just as wrong in a
    // config comment or a markdown bullet as in a directive, and a bullet is
    // exactly where it survived two rounds of review.
    test: (line) => /include\s+[^;`]*(?:rate-limits|conn-limits)[^;`]*\*/.test(line),
    why: "wildcards an include that carries a protective directive; use the exact path so a missing file is a startup error"
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
    ["source-address", "        allow 2001:db8::42;"],
    ["source-address", "        allow fe80::1;"],
    ["source-address", "        allow ::ffff:192.0.2.1;"],
    ["source-address", "        allow 2001:db8::/32;"],
    ["source-address", "        proxy_pass http://[2001:db8::5]:8080;"],
    ["inline-allowlist", "        allow 198.51.100.7;"],
    ["threshold", "        # SSR page rate limit: 15 req/s per client IP"],
    ["threshold", "        limit_req_zone $x zone=y:1m rate=7r/s;"],
    ["threshold", "        limit_conn total_ssr 150;"],
    ["secret-marker", "        # TODO remove api_key=hunter2 before shipping"],
    ["wildcard-protective-include", "        include /etc/nginx/rate-limits*.conf;"],
    ["wildcard-protective-include", "        include /etc/nginx/conn-limits*.conf;"]
  ];
  // Committed today and legitimate: a false positive here breaks the repo.
  const MUST_NOT_FIRE = [
    "        proxy_pass         http://127.0.0.1:3000;",
    "        proxy_pass         http://[::1]:3000;",
    "    listen [::]:443 ssl http2;",
    "    listen 0.0.0.0:80;",
    "        # see nginx 1.24.0 release notes",
    "        ssl_certificate /etc/letsencrypt/live/eu.ecency.com/fullchain.pem;",
    "        limit_req zone=ssrlimit burst=50 nodelay;",
    "        include /etc/nginx/foo-allow*.conf;",
    "        deny all;",
    "        include /etc/nginx/rate-limits.conf;",
    "        include /etc/nginx/conn-limits.conf;"
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
  // The presence guard is control flow rather than a rule, and it has now broken
  // twice: once by exiting 0 when the directory was missing, and once by counting
  // the README after markdown joined the scan, so removing every vhost left a
  // non-zero total and CI passed over nothing tracked. Both failures were the same
  // shape, a guard measuring the collection instead of the thing it guards, so it
  // is pinned here and the next widening of the scan trips a test.
  const PRESENCE = [
    [["infra/origin/eu.ecency.com.conf", "infra/origin/README.md"], 1],
    [["infra/origin/eu.ecency.com.conf", "infra/origin/us.ecency.com.conf", "infra/origin/README.md"], 2],
    [["infra/origin/README.md"], 0],
    [["infra/origin/README.md", "infra/origin/notes.md"], 0],
    [[], 0]
  ];
  for (const [input, expected] of PRESENCE) {
    const got = originConfigsIn(input).length;
    if (got !== expected) {
      failures.push(`originConfigsIn(${JSON.stringify(input)}) counted ${got}, expected ${expected}`);
    }
  }
  failures.forEach((f) => console.error(`origin-config-audit self-test: ${f}`));
  console.log(`origin-config-audit self-test: ${failures.length} failure(s), ${MUST_FIRE.length + MUST_NOT_FIRE.length + PRESENCE.length} case(s)`);
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

// Counted on the CONFIGS specifically, not on everything collected. Adding
// markdown to the scan made this guard count the README, so deleting every
// vhost left a non-zero total and the audit passed with nothing tracked: the
// exact vacuous pass this guard exists to prevent, reintroduced by widening the
// collection beside it.
const trackedConfigs = originConfigsIn(files);
if (trackedConfigs.length === 0) {
  console.error(`origin-config-audit: no .conf files under ${relative(ROOT, AUDITED)}; did they move?`);
  console.error("  Documentation alone is not a tracked origin. If the vhosts moved, update AUDITED.");
  process.exit(FAIL ? 1 : 0);
}

const findings = [];
for (const file of files) {
  if (!statSync(file).isFile()) continue;
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((text, i) => {
      if (text.trim().length === 0) return;
      // Documentation is checked for the one rule it can contradict: a runbook
      // telling an operator to wildcard a protective include is as harmful as
      // the config doing it, and that is exactly how this drifted twice.
      const applicable = file.endsWith(".md") ? RULES.filter((r) => r.id === "wildcard-protective-include") : RULES;
      for (const rule of applicable) {
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
