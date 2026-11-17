#!/usr/bin/env python3
"""
Custom-domain (and dotted-subdomain) TLS + vhost sync for managed blog hosting.

Two kinds of host need a per-host certificate:

  * verified custom domains of active pro tenants;
  * tenants whose Hive account name contains a dot (e.g. louis.random). Their blog
    lives at louis.random.blogs.ecency.com, which is TWO labels under the base
    domain, so the *.blogs.ecency.com wildcard certificate does not cover it
    (TLS wildcards match exactly one label). Without this, the tenant's blog fails
    with SSL_ERROR / "no alternative certificate subject name matches".

For each such host this script:
  1. before a FIRST issuance only, checks the domain resolves to this origin (protects LE
     rate limits). A failed lookup never removes anything: removal is driven solely by the
     domain leaving the DB, so a resolver blip cannot delete a live vhost/certificate,
  2. issues a Let's Encrypt certificate via HTTP-01 webroot if none exists
     (the default_server on :80 serves /var/www/html, which answers the challenge),
  3. generates an nginx vhost that terminates TLS and proxies to the blog container
     with X-Tenant-Id set to the tenant, so the container serves the right config,
  4. removes vhosts (and stops renewing certs) for domains no longer in the DB,
  5. reloads nginx when anything changed.

Run from cron every 5 minutes. Use --dry-run to log intended actions only.
State (issuance attempt backoff) lives in state.json next to this script.
"""

import fcntl
import json
import os
import re
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone

# Imported defensively: these files are copied to the origin by hand, and a
# half-copied directory must not stop certificates and vhosts (#1586).
try:
    import turnstile_domains
except Exception as _turnstile_import_error:  # pragma: no cover - exercised via the None path
    turnstile_domains = None
    TURNSTILE_IMPORT_ERROR = f"{type(_turnstile_import_error).__name__}: {_turnstile_import_error}"
else:
    TURNSTILE_IMPORT_ERROR = ""

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_FILE = os.path.join(BASE_DIR, "sync.log")
LOCK_FILE = os.path.join(BASE_DIR, ".lock")
STATE_FILE = os.path.join(BASE_DIR, "state.json")

VHOST_DIR = "/etc/nginx/custom-domains"
WEBROOT = "/var/www/html"
# Base domain for managed tenant blogs. Tenants whose name contains a dot land two
# labels deep here and therefore need their own certificate.
MANAGED_BASE = "blogs.ecency.com"
LE_LIVE = "/etc/letsencrypt/live"
BLOG_UPSTREAM = "127.0.0.1:3100"
CERTBOT_EMAIL = "hello@ecency.com"

# This origin's public addresses; a domain must resolve here before we try issuance.
# Read from origin-ips (one address per line, # comments allowed) next to this script, or
# from HOSTING_ORIGIN_IPS as a comma-separated override. Kept out of the source because
# this repo is public and these are the addresses behind Cloudflare — publishing them
# would hand over a ready-made origin-bypass list.
def _load_origin_ips() -> set:
    env = os.environ.get("HOSTING_ORIGIN_IPS", "").strip()
    if env:
        return {p.strip() for p in env.split(",") if p.strip()}
    path = os.path.join(BASE_DIR, "origin-ips")
    try:
        with open(path) as f:
            return {
                line.strip()
                for line in f
                if line.strip() and not line.lstrip().startswith("#")
            }
    except FileNotFoundError:
        raise SystemExit(
            f"missing {path} (or HOSTING_ORIGIN_IPS): one origin address per line. "
            "Without it every DNS check would fail closed and no certificate could issue."
        )


OUR_IPS = _load_origin_ips()

DOMAIN_RE = re.compile(r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$")
USERNAME_RE = re.compile(r"^[a-z][a-z0-9.-]{2,15}$")

DRY_RUN = "--dry-run" in sys.argv


def log(msg: str) -> None:
    line = f"{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')} {msg}"
    print(line)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")


def load_state() -> dict:
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except Exception:
        return {}


def save_state(state: dict) -> None:
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f, indent=1)
    os.rename(tmp, STATE_FILE)


def fetch_domains() -> list[tuple[str, str]]:
    """(domain, tenant_username) for verified custom domains of active pro tenants."""
    # 'expired' is included alongside 'active' for the same reason as the dotted
    # subdomains below: an expired tenant keeps serving through the grace period, so
    # pulling its certificate would break the domain outright instead of letting it
    # lapse gracefully — and re-issuing later costs a Let's Encrypt round trip.
    sql = (
        "SELECT custom_domain, username FROM tenants "
        "WHERE custom_domain IS NOT NULL AND custom_domain <> '' "
        "AND custom_domain_verified = true "
        "AND subscription_status IN ('active', 'expired') "
        "AND subscription_plan = 'pro';"
    )
    out = subprocess.run(
        ["docker", "exec", "ecency-hosting-postgres",
         "psql", "-U", "postgres", "-d", "hosting", "-t", "-A", "-F", "|", "-c", sql],
        capture_output=True, text=True, timeout=30,
    )
    if out.returncode != 0:
        raise RuntimeError(f"DB query failed: {out.stderr.strip()[:300]}")
    rows = []
    for line in out.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split("|")
        if len(parts) != 2:
            log(f"SKIP malformed row: {line[:120]}")
            continue
        domain, username = parts[0].strip().lower(), parts[1].strip().lower()
        if not DOMAIN_RE.match(domain) or len(domain) > 255:
            log(f"SKIP invalid domain shape: {domain[:120]}")
            continue
        # Never allow claiming our own namespace through the tenant DB.
        if domain == "ecency.com" or domain.endswith(".ecency.com"):
            log(f"SKIP reserved domain: {domain}")
            continue
        if not USERNAME_RE.match(username):
            log(f"SKIP invalid tenant name: {username[:60]}")
            continue
        rows.append((domain, username))
    return rows


def fetch_dotted_subdomains() -> list[tuple[str, str]]:
    """(host, tenant_username) for serving tenants whose name contains a dot.

    Hive account names may contain dots, so these tenants sit two labels under
    MANAGED_BASE and fall outside the wildcard certificate. Expired tenants are
    included deliberately: they keep serving during the grace period, and pulling
    their certificate would break TLS rather than degrade gracefully.
    """
    sql = (
        "SELECT username FROM tenants "
        "WHERE username LIKE '%.%' "
        "AND subscription_status IN ('active', 'expired');"
    )
    out = subprocess.run(
        ["docker", "exec", "ecency-hosting-postgres",
         "psql", "-U", "postgres", "-d", "hosting", "-t", "-A", "-c", sql],
        capture_output=True, text=True, timeout=30,
    )
    if out.returncode != 0:
        raise RuntimeError(f"DB query failed (dotted): {out.stderr.strip()[:300]}")
    rows = []
    for line in out.stdout.splitlines():
        username = line.strip().lower()
        if not username:
            continue
        if not USERNAME_RE.match(username):
            log(f"SKIP invalid dotted tenant name: {username[:60]}")
            continue
        host = f"{username}.{MANAGED_BASE}"
        # Guard the shape that actually reaches certbot -d and nginx server_name.
        if not DOMAIN_RE.match(host) or len(host) > 255:
            log(f"SKIP invalid dotted tenant host: {host[:120]}")
            continue
        rows.append((host, username))
    return rows


def resolves_to_us(domain: str) -> bool:
    ips = set()
    for family in (socket.AF_INET, socket.AF_INET6):
        try:
            for info in socket.getaddrinfo(domain, 443, family, socket.SOCK_STREAM):
                ips.add(info[4][0])
        except socket.gaierror:
            continue
    return bool(ips & OUR_IPS)


def cert_exists(domain: str) -> bool:
    return os.path.isfile(os.path.join(LE_LIVE, domain, "fullchain.pem"))


def issuance_allowed(state: dict, domain: str) -> bool:
    """Backoff so a broken domain can't burn Let's Encrypt failed-validation limits."""
    entry = state.get(domain)
    if not entry:
        return True
    wait = min(3600 * 6, 300 * (2 ** min(entry.get("attempts", 0), 6)))
    return time.time() - entry.get("last_attempt", 0) > wait


def issue_cert(state: dict, domain: str) -> bool:
    if DRY_RUN:
        log(f"DRY-RUN would issue certificate for {domain}")
        return False
    log(f"Issuing certificate for {domain}")
    out = subprocess.run(
        ["certbot", "certonly", "--webroot", "-w", WEBROOT, "-d", domain,
         "--non-interactive", "--agree-tos", "--email", CERTBOT_EMAIL,
         "--no-eff-email", "--keep-until-expiring"],
        capture_output=True, text=True, timeout=180,
    )
    if out.returncode != 0:
        entry = state.get(domain, {"attempts": 0})
        entry["attempts"] = entry.get("attempts", 0) + 1
        entry["last_attempt"] = time.time()
        state[domain] = entry
        log(f"FAILED issuance for {domain} (attempt {entry['attempts']}): "
            f"{(out.stderr or out.stdout).strip()[-300:]}")
        return False
    state.pop(domain, None)
    log(f"Issued certificate for {domain}")
    return True


def vhost_content(domain: str, username: str) -> str:
    return f"""# Auto-generated by hosting-domains/sync-custom-domains.py. Do not edit.
# tenant: {username}
server {{
    listen 80;
    listen [::]:80;
    server_name {domain};

    location /.well-known/acme-challenge/ {{
        root {WEBROOT};
    }}
    location / {{
        return 301 https://$host$request_uri;
    }}
}}

server {{
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name {domain};

    ssl_certificate     {LE_LIVE}/{domain}/fullchain.pem;
    ssl_certificate_key {LE_LIVE}/{domain}/privkey.pem;

    location / {{
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Tenant-Id {username};
        proxy_pass http://{BLOG_UPSTREAM};
    }}
}}
"""


def write_vhost(domain: str, username: str) -> bool:
    """Write the vhost if missing or changed. Returns True when the file changed."""
    path = os.path.join(VHOST_DIR, f"{domain}.conf")
    content = vhost_content(domain, username)
    try:
        with open(path) as f:
            if f.read() == content:
                return False
    except FileNotFoundError:
        pass
    if DRY_RUN:
        log(f"DRY-RUN would write vhost {path}")
        return False
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        f.write(content)
    os.rename(tmp, path)
    log(f"Wrote vhost for {domain} -> tenant {username}")
    return True


def remove_stale(desired: set[str]) -> list[str]:
    removed = []
    if not os.path.isdir(VHOST_DIR):
        return removed
    for name in os.listdir(VHOST_DIR):
        if not name.endswith(".conf"):
            continue
        domain = name[:-5]
        if domain in desired:
            continue
        path = os.path.join(VHOST_DIR, name)
        if DRY_RUN:
            log(f"DRY-RUN would remove stale vhost {path}")
            continue
        os.remove(path)
        removed.append(domain)
        log(f"Removed stale vhost for {domain}")
        # Stop renewing its certificate; the domain can be re-issued if it returns.
        out = subprocess.run(
            ["certbot", "delete", "--cert-name", domain, "--non-interactive"],
            capture_output=True, text=True, timeout=60,
        )
        if out.returncode != 0:
            log(f"WARN certbot delete failed for {domain}: {out.stderr.strip()[-200:]}")
    return removed


def reload_nginx(new_files: list[str]) -> None:
    if DRY_RUN:
        log("DRY-RUN would reload nginx")
        return
    test = subprocess.run(["nginx", "-t"], capture_output=True, text=True, timeout=30)
    if test.returncode != 0:
        # Quarantine the vhosts written this run so a bad file can't wedge nginx reloads.
        quarantined = []
        for domain in new_files:
            path = os.path.join(VHOST_DIR, f"{domain}.conf")
            if os.path.exists(path):
                os.rename(path, path + ".broken")
                quarantined.append(path)
                log(f"nginx -t failed; quarantined {path}.broken")
        retest = subprocess.run(["nginx", "-t"], capture_output=True, text=True, timeout=30)
        if retest.returncode != 0:
            # The failure was already there and none of this run's files caused it, so
            # putting them back is right: leaving them quarantined would take working
            # domains down for a problem they had nothing to do with.
            for path in quarantined:
                os.rename(path + ".broken", path)
            if quarantined:
                log(f"restored {len(quarantined)} vhost(s): pre-existing nginx config error, not ours")
            log(f"CRITICAL nginx -t still failing, NOT reloading: {retest.stderr.strip()[-300:]}")
            return
    subprocess.run(["systemctl", "reload", "nginx"], timeout=30)
    log("Reloaded nginx")


def main() -> None:
    lock = open(LOCK_FILE, "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        return  # previous run still active

    state = load_state()
    # Both lists produce the same vhost shape (TLS + proxy with X-Tenant-Id), so they
    # share issuance, backoff, stale-removal and reload handling.
    custom = fetch_domains()
    domains = custom + fetch_dotted_subdomains()
    desired: set[str] = set()
    changed: list[str] = []

    for domain, username in domains:
        # Membership of `desired` follows the DB and nothing else. It used to depend on
        # the DNS check below, which meant one failed lookup — a resolver blip is enough,
        # since getaddrinfo errors resolve to "not ours" — dropped a live domain from the
        # set and the sweep then deleted its vhost AND its certificate. Removal is now
        # driven only by the domain leaving the DB, which is the one signal that actually
        # means the customer is done with it.
        desired.add(domain)

        if not cert_exists(domain):
            # The DNS gate belongs here: its purpose is to avoid burning Let's Encrypt
            # failure limits on domains that do not point at us yet, which is an
            # issuance concern, not a reason to tear down something already serving.
            if not resolves_to_us(domain):
                log(f"SKIP {domain}: DNS does not resolve to this origin yet")
                continue
            if not issuance_allowed(state, domain):
                log(f"SKIP {domain}: issuance backoff active")
                continue
            if not issue_cert(state, domain):
                continue

        # Only reached with a certificate on disk; the vhost references its paths, so
        # writing one without it would fail nginx -t.
        if write_vhost(domain, username):
            changed.append(domain)

    removed = remove_stale(desired)
    save_state(state)

    if changed or removed:
        reload_nginx(changed)

    sync_turnstile([domain for domain, _ in custom], state)
    save_state(state)


def sync_turnstile(custom_domains: list[str], state: dict) -> None:
    """Add verified custom domains to the newsletter Turnstile widget (#1586).

    Custom domains only: dotted tenants live under blogs.ecency.com, which the
    widget's ecency.com entry already covers. See turnstile_domains.py; it never
    removes a domain and never raises.
    """
    if not custom_domains:
        return
    lines: list[str] = []
    if turnstile_domains is None:
        lines.append(
            "TURNSTILE FAILED: turnstile_domains.py is missing or broken next to this script "
            f"({TURNSTILE_IMPORT_ERROR or 'not imported'}); copy it with sync-custom-domains.py"
        )
    else:
        config = turnstile_domains.load_config(BASE_DIR, os.environ)
        if config is None:
            lines.append("TURNSTILE SKIPPED: no turnstile.env; custom domains must be added to the widget by hand")
        else:
            turnstile_domains.reconcile(
                custom_domains, config, turnstile_domains.http_json, lines.append, dry_run=DRY_RUN
            )
    # This runs every 5 minutes: write an outcome when it changes, not 288 times
    # a day. A success is always new; a failure that persists is logged once.
    outcome = "\n".join(lines)
    if outcome != state.get("turnstile_last_outcome", ""):
        for line in lines:
            log(line)
    if not DRY_RUN:
        # A manual dry run must not make the next real run stay silent.
        state["turnstile_last_outcome"] = outcome


if __name__ == "__main__":
    main()
