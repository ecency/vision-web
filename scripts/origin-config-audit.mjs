// Committed-infrastructure audit: origin nginx config (infra/origin/README.md)
// and the deployment files that size the fleet.
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
// The deployment files are audited because a rule that covers one directory
// protects one directory, and sizing decisions are written down where the
// sizing happens. Comments there are as published as the config beside them.
//
// Rules are scoped. The nginx ones (`allow`/`deny` lines, protective includes)
// have no meaning in YAML and would only invent findings there, so they stay
// where they apply. Capacity and addresses are disclosures wherever they sit.
//
// CI runs with --fail: any finding exits 1.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { isIP } from "node:net";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const AUDITED = join(ROOT, "infra");
/**
 * Deployment files that size the fleet: the stack files and the workflows that
 * feed them per-region values. Listed rather than globbed from the repo root so
 * adding one is a deliberate edit, and so the presence guard below can count
 * something specific.
 */
const DEPLOY_AUDITED = [
  join(ROOT, "apps/web/docker-compose.production.yml"),
  join(ROOT, "apps/web/docker-compose.yml"),
  join(ROOT, ".github/workflows/master.yml"),
  join(ROOT, ".github/workflows/staging.yml")
];
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
    for (const m of line.matchAll(/\[?[0-9A-Fa-f:.]{2,}\]?(?::\d+)?(?:\/\d+)?/g)) {
        const raw = m[0];
        if (!raw.includes(":") && !raw.includes(".")) continue;
        // An address is a token, not a substring. `::error::vision_web` in a
        // workflow annotation yields `::e`, and `notice::deployed` yields
        // `ce::de`; both are valid IPv6 by isIP and neither is an address. So a
        // match glued to a word on either side is prose, not configuration.
        const before = line[m.index - 1] ?? " ";
        const after = line[m.index + raw.length] ?? " ";
        if (/[A-Za-z0-9_-]/.test(before) || /[A-Za-z0-9_-]/.test(after)) continue;
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

/**
 * Literals that must never appear in a committed file, supplied by the
 * environment rather than listed here: a list of forbidden strings is itself
 * a disclosure when the repository is public. Comma-separated, read at call
 * time so a run can be scoped without reloading.
 */
function extraMarkers() {
  return (process.env.AUDIT_FORBIDDEN_MARKERS ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}

const RULES = [
  {
    id: "source-address",
    scope: "all",
    // IPv4 and IPv6. An IPv6 literal is just as much an origin address, and the
    // first version of this audit saw only dotted quads.
    test: (line) => addressesIn(line).some((addr) => !NOT_A_DISCLOSURE.has(addr)),
    why: "names a source address; move it to an /etc/nginx include that is not in git"
  },
  {
    id: "inline-allowlist",
    scope: "nginx",
    // `deny all` is permitted on purpose: the documented pattern is
    // `include /etc/nginx/<name>-allow*.conf;` followed by `deny all;`, so
    // rejecting the closing line would reject the remediation itself.
    test: (line) => /^\s*(?:allow|deny)\s+(?!all\s*;)\S/.test(line),
    why: "inlines an allowlist entry; use `include /etc/nginx/<name>-allow*.conf;` then `deny all;` so a missing file fails closed"
  },
  {
    id: "threshold",
    scope: "all",
    // Rates, zone definitions and connection ceilings, in directives OR prose.
    test: (line) =>
      /\b\d+\s*(?:r\/[sm]\b|req\/s\b|requests?\/s(?:ec)?\b)/i.test(line) ||
      /^\s*limit_req_zone\s/.test(line) ||
      /^\s*limit_conn\s+\S+\s+\d+/.test(line),
    why: "states a threshold; these live in /etc/nginx/{rate-limits,conn-limits}.conf, which are not in git"
  },
  {
    id: "wildcard-protective-include",
    scope: "nginx",
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
    scope: "all",
    // A NAME is not a value. Workflows are full of `PLAUSIBLE_API_KEY:
    // ${{ secrets.PLAUSIBLE_API_KEY }}` and `export FOO=$FOO`, which is the
    // correct handling of a secret, so references are stripped before asking
    // whether anything is assigned a literal. Environment-supplied markers are
    // checked first and are matched anywhere in the line.
    test: (line) => {
      const lower = line.toLowerCase();
      if (extraMarkers().some((marker) => lower.includes(marker.toLowerCase()))) return true;
      const withoutRefs = line
        // `${{ secrets.NAME }}`: a reference, nothing of it is a value.
        .replace(/\$\{\{[^}]*\}\}/g, "")
        // `${NAME:?message}` is a required-variable expansion. The message is
        // an error string, never a credential, so the whole form goes -- and
        // this repo writes exactly that in its deploy scripts.
        .replace(/\$\{[A-Za-z_][A-Za-z0-9_]*:\?[^}]*\}/g, "")
        // `${NAME:-default}` and `${NAME:+alt}` carry a VALUE, and a default
        // is a place a secret can actually sit, so the name goes and the value
        // stays to be checked.
        .replace(/\$\{[A-Za-z_][A-Za-z0-9_]*:[-+]([^}]*)\}/g, "$1")
        .replace(/\$\{[A-Za-z_][A-Za-z0-9_]*\}/g, "")
        .replace(/\$[A-Za-z_][A-Za-z0-9_]*/g, "");
      return (
        /(?:api[_-]?key|password|secret[_-]?key)\s*[:=]\s*\S/i.test(withoutRefs) ||
        /Bearer\s+\S/.test(withoutRefs)
      );
    },
    why: "looks like a credential or a secret marker"
  },
  {
    id: "host-capacity",
    scope: "all",
    // What a machine HAS, as opposed to what a process is allowed. The limits
    // themselves have to be committed: they are the configuration. The
    // inventory behind them must not be, since a size next to a machine noun,
    // a provider machine type or a RAM/core pair describes a specific machine
    // and how much of it is spare.
    //
    // Sized in MiB, or a figure with no machine noun near it, is a process
    // limit or a measurement and passes: `memory: 4608M`, `~128MiB of RSS`,
    // `2gb doubles the working set`.
    test: (line) => {
      if (/\b(?:cx|cpx|ccx|sx|ax|cax)\d{2,3}\b/i.test(line)) return true;
      if (/\d+(?:\.\d+)?\s?(?:GiB|GB|TB)\s*\/\s*\d+\s?(?:c\b|cores?\b|vcpus?\b)/i.test(line)) {
        return true;
      }
      const HOST_NOUN = /\b(?:box|boxe?s|host|hosts|server|servers|machine|machines)\b/i;
      for (const m of line.matchAll(/\b\d+(?:\.\d+)?\s?(?:GiB|GB|TB)\b/gi)) {
        const near = line.slice(Math.max(0, m.index - 48), m.index + m[0].length + 48);
        if (HOST_NOUN.test(near)) return true;
      }
      return false;
    },
    why: "states host capacity; per-host figures belong with the infrastructure notes, not in a public repo"
  }
];

/** The rules that apply to a file, by what the file is. */
function rulesFor(kind) {
  return RULES.filter((rule) => rule.scope === "all" || rule.scope === kind);
}

/**
 * Prose gets the rules it can actually contradict. A runbook telling an operator
 * to wildcard a protective include is as harmful as the config doing it, which
 * is how this drifted twice. Capacity and addresses belong here for the same
 * reason the file header gives: a comment in a public repository is published,
 * and a README saying what a host has discloses exactly as much as a config
 * comment saying it.
 */
// Derived, not listed: every rule that is a disclosure anywhere applies to
// prose too, so adding one covers documentation without a second edit. Listing
// them by hand is how threshold and the credential rule were left out of
// markdown while the threshold rule's own comment claimed to cover prose.
const PROSE_ONLY_NGINX_RULES = ["wildcard-protective-include"];

function rulesForFile(file) {
  if (file.endsWith(".md")) {
    return RULES.filter(
      (rule) => rule.scope === "all" || PROSE_ONLY_NGINX_RULES.includes(rule.id)
    );
  }
  if (file.endsWith(".yml") || file.endsWith(".yaml")) return rulesFor("deploy");
  return rulesFor("nginx");
}

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
    // Trailing `::` forms, pinned after review asked whether they were covered.
    // They were, since net.isIP replaced the hand-rolled pattern, but "covered
    // and untested" is how the previous regex looked right up until it wasn't.
    ["source-address", "        allow 2001:db8::;"],
    ["source-address", "        allow fe80::;"],
    ["source-address", "        allow 64:ff9b::1;"],
    ["source-address", "        proxy_pass http://[2001:db8::]:8080;"],
    ["source-address", "        proxy_pass http://[2001:db8::5]:8080;"],
    ["inline-allowlist", "        allow 198.51.100.7;"],
    ["threshold", "        # SSR page rate limit: 15 req/s per client IP"],
    ["threshold", "        limit_req_zone $x zone=y:1m rate=7r/s;"],
    ["threshold", "        limit_conn total_ssr 150;"],
    ["secret-marker", "        # TODO remove api_key=hunter2 before shipping"],
    ["wildcard-protective-include", "        include /etc/nginx/rate-limits*.conf;"],
    ["wildcard-protective-include", "        include /etc/nginx/conn-limits*.conf;"],
    // Invented values throughout: a fixture is committed, so it must not be a
    // specimen of the thing it rejects.
    ["host-capacity", "        # this tier is smaller than the other (77GiB/9c vs 144GiB/33c)"],
    ["host-capacity", "      # 77GiB box with headroom for the supporting services"],
    ["host-capacity", "      # 9GiB keeps three replicas (27GiB) under the 77GiB box"],
    ["host-capacity", "        # the host has 144 GiB / 33 cores"],
    ["host-capacity", "        # this tier runs on a cpx99"],
    ["host-capacity", "        # each server carries 512GB"],
    // The name is stripped, the default is not: a literal in a default is a
    // literal wherever it sits.
    ["secret-marker", "          export API_KEY=${API_KEY:-hunter2}"],
  ];
  // Committed today and legitimate: a false positive here breaks the repo.
  // Each carries the file it would live in, because rules are scoped now and a
  // check that ignores scope does not mirror the audit it is testing.
  const MUST_NOT_FIRE = [
    ["vhost.conf", "        proxy_pass         http://127.0.0.1:3000;"],
    ["vhost.conf", "        proxy_pass         http://[::1]:3000;"],
    ["vhost.conf", "    listen [::]:443 ssl http2;"],
    ["vhost.conf", "    listen 0.0.0.0:80;"],
    ["vhost.conf", "        # see nginx 1.24.0 release notes"],
    ["vhost.conf", "        ssl_certificate /etc/letsencrypt/live/eu.ecency.com/fullchain.pem;"],
    ["vhost.conf", "        limit_req zone=ssrlimit burst=50 nodelay;"],
    ["vhost.conf", "        include /etc/nginx/foo-allow*.conf;"],
    ["vhost.conf", "        deny all;"],
    ["vhost.conf", "        include /etc/nginx/rate-limits.conf;"],
    ["vhost.conf", "        include /etc/nginx/conn-limits.conf;"],
    // Deployment files. A process limit is the configuration and has to be
    // committed; a measurement with no machine noun beside it is rationale.
    ["deploy.yml", "          memory: ${WEB_MEM_LIMIT:-4608M}"],
    ["deploy.yml", "      - NODE_OPTIONS=--max-old-space-size=${WEB_HEAP_MB:-3072} --max-semi-space-size=64"],
    ["deploy.yml", "      # allocation-heavy render triggers fewer scavenges; costs ~128MiB of RSS"],
    ["deploy.yml", "      - ${REDIS_MAXMEMORY:-2gb}"],
    ["deploy.yml", "      # re-render far more often than their age warrants. 2gb doubles the working"],
    ["deploy.yml", "      # here: replica RSS is flat against in-flight renders (~2.2GB at 5, 11 and"],
    ["deploy.yml", "        WEB_REPLICAS: \"4\""],
    ["deploy.yml", "      replicas: ${WEB_REPLICAS:-4}"],
    // A secret NAME, a reference to one, and a required-variable expansion
    // whose message merely repeats the name, are all correct handling.
    ["deploy.yml", "        PLAUSIBLE_API_KEY: ${{secrets.PLAUSIBLE_API_KEY}}"],
    ["deploy.yml", "          export PLAUSIBLE_API_KEY=$PLAUSIBLE_API_KEY"],
    ["deploy.yml", "          : \"${NEWSLETTER_API_URL:?NEWSLETTER_API_URL is required for the US deploy}\""],
    ["deploy.yml", "          export API_KEY=${API_KEY:?API_KEY is required}"],
    ["deploy.yml", "          password=${PASSWORD:?password is required}"],
    // Workflow annotations: `::error::` parses as a valid IPv6 address unless
    // the matcher requires delimiters.
    ["deploy.yml", "    echo \"::error::vision_web rolled back (UpdateStatus=$state); prod still on the previous image\""],
    ["deploy.yml", "    echo \"::notice::deployed ecency/vision-web:latest\""]
  ];
  const failures = [];
  for (const [id, line] of MUST_FIRE) {
    const rule = RULES.find((r) => r.id === id);
    if (!rule.test(line)) failures.push(`rule ${id} did NOT fire on: ${line.trim()}`);
  }
  for (const [file, line] of MUST_NOT_FIRE) {
    for (const rule of rulesForFile(file)) {
      if (rule.test(line)) {
        failures.push(`rule ${rule.id} wrongly fired on ${file}: ${line.trim()}`);
      }
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
  // The marker list lives in the environment, so the mechanism is what gets
  // tested here rather than any particular value.
  const markerRule = RULES.find((r) => r.id === "secret-marker");
  const savedMarkers = process.env.AUDIT_FORBIDDEN_MARKERS;
  process.env.AUDIT_FORBIDDEN_MARKERS = "SomeInternalAgent/9.9, AnotherMarker";
  for (const line of ["  # sends SomeInternalAgent/9.9 upstream", "  proxy_set_header X-Thing anothermarker;"]) {
    if (!markerRule.test(line)) failures.push(`secret-marker did NOT fire on an environment marker: ${line.trim()}`);
  }
  if (markerRule.test("  # sends an ordinary user agent upstream")) {
    failures.push("secret-marker fired on a line carrying no marker");
  }
  process.env.AUDIT_FORBIDDEN_MARKERS = "";
  if (markerRule.test("  # sends SomeInternalAgent/9.9 upstream")) {
    failures.push("secret-marker fired with no markers configured");
  }
  if (savedMarkers === undefined) delete process.env.AUDIT_FORBIDDEN_MARKERS;
  else process.env.AUDIT_FORBIDDEN_MARKERS = savedMarkers;

  // Scope is control flow too: a rule that quietly stops applying to a file
  // type is the same failure as a regex edited into uselessness.
  const SCOPES = [
    ["deploy.yml", "host-capacity", true],
    ["deploy.yml", "source-address", true],
    ["deploy.yml", "secret-marker", true],
    ["deploy.yml", "inline-allowlist", false],
    ["deploy.yml", "wildcard-protective-include", false],
    ["vhost.conf", "inline-allowlist", true],
    ["vhost.conf", "threshold", true],
    ["README.md", "host-capacity", true],
    ["README.md", "source-address", true],
    ["README.md", "wildcard-protective-include", true],
    // Documentation is published too: the threshold rule's own comment says it
    // covers prose, and a credential in a runbook is a credential.
    ["README.md", "threshold", true],
    ["README.md", "secret-marker", true],
    ["README.md", "inline-allowlist", false]
  ];
  for (const [file, id, expected] of SCOPES) {
    const applies = rulesForFile(file).some((r) => r.id === id);
    if (applies !== expected) {
      failures.push(`rulesForFile(${file}) ${applies ? "includes" : "omits"} ${id}, expected the opposite`);
    }
  }
  // The deployment set is named rather than discovered, so dropping an entry
  // shrinks the audit silently. Pin what must be in it.
  const MUST_AUDIT = [
    "apps/web/docker-compose.production.yml",
    "apps/web/docker-compose.yml",
    ".github/workflows/master.yml",
    ".github/workflows/staging.yml"
  ];
  for (const want of MUST_AUDIT) {
    if (!DEPLOY_AUDITED.some((f) => relative(ROOT, f) === want)) {
      failures.push(`DEPLOY_AUDITED no longer covers ${want}`);
    }
  }
  failures.forEach((f) => console.error(`origin-config-audit self-test: ${f}`));
  console.log(`origin-config-audit self-test: ${failures.length} failure(s), ${MUST_FIRE.length + MUST_NOT_FIRE.length + PRESENCE.length + SCOPES.length + MUST_AUDIT.length} case(s)`);
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

// The deployment files are named, not discovered, so a missing one is a finding
// rather than a quiet shrink of the scan -- the same failure the directory guard
// above exists for.
const deployFiles = [];
for (const file of DEPLOY_AUDITED) {
  try {
    if (statSync(file).isFile()) deployFiles.push(file);
    else throw new Error("not a file");
  } catch {
    console.error(`origin-config-audit: cannot read ${relative(ROOT, file)}`);
    console.error("  If it moved or was renamed, update DEPLOY_AUDITED in this script in the same commit.");
    if (FAIL) process.exit(1);
  }
}

const findings = [];
for (const file of [...files, ...deployFiles]) {
  if (!statSync(file).isFile()) continue;
  const applicable = rulesForFile(file);
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((text, i) => {
      if (text.trim().length === 0) return;
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
console.log(
  `origin-config-audit: ${findings.length} finding(s) in ${files.length + deployFiles.length} file(s)` +
    ` (${files.length} origin, ${deployFiles.length} deployment)`
);
if (findings.length > 0 && FAIL) process.exit(1);
