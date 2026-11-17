"""Keep the newsletter Turnstile widget's hostname list in step with custom domains (#1586).

A Turnstile sitekey is bound to a hostname list, and a hostname covers itself and
all of its subdomains. Every *.blogs.ecency.com tenant is covered by the
`ecency.com` entry; a custom domain on its own apex is not, and without it the
tenant's newsletter signup shows a widget that never solves. Nothing reports
that to us, so sync-custom-domains.py calls this on every run.

Rules:
  * Add only. A domain is never removed from the widget, so a database blip, or a
    tenant that lapsed, can never break another tenant's form.
  * Read-modify-write. The API's update is a PUT of the whole widget, so the body
    is built from the CURRENT widget, with the settings a PUT would reset carried
    over, and the result read back to confirm nothing was lost. The API caps a
    widget at 10 hostnames: what fits is added, the rest is named in the log.
  * Never fatal. A failure is logged with a TURNSTILE FAILED prefix and the vhost
    sync carries on; the next run tries again.

Configuration (not in git): `turnstile.env` next to this file, or the same keys
in the environment, which win:
  TURNSTILE_ACCOUNT_ID  Cloudflare account id
  TURNSTILE_SITEKEY     the newsletter widget's sitekey
  TURNSTILE_API_TOKEN   an API token with Turnstile: Edit
Without all three the step is skipped and says so in the log.

stdlib only, like the rest of this directory.
"""
import json
import os
import urllib.error
import urllib.request
from typing import Callable, Iterable, NamedTuple, Optional

API = "https://api.cloudflare.com/client/v4"
ENV_FILE = "turnstile.env"
KEYS = ("TURNSTILE_ACCOUNT_ID", "TURNSTILE_SITEKEY", "TURNSTILE_API_TOKEN")

# The update is a PUT of the whole widget: a setting left out is reset to its
# default, so these are carried over from the current widget. `region` cannot be
# changed after creation and the update has been seen to refuse it, so it is never
# sent; sitekey, secret and the dates are read-only.
CARRIED = ("name", "mode", "clearance_level")
# Enterprise-only flags. Off is their default, so they are sent only when on:
# sending them on a plan without them risks a refused write.
ENTERPRISE_FLAGS = ("bot_fight_mode", "offlabel", "ephemeral_id")
# The API's limit on a widget's hostname list.
MAX_DOMAINS = 10


class Config(NamedTuple):
    account_id: str
    sitekey: str
    token: str


Http = Callable[..., dict]
Log = Callable[[str], None]


def load_config(base_dir: str, environ) -> Optional[Config]:
    values = {}
    try:
        with open(os.path.join(base_dir, ENV_FILE), encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("export "):
                    line = line[len("export "):].strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip().strip("'\"")
    except (OSError, ValueError):
        # Missing, unreadable or not text: treated as unconfigured, never fatal.
        values = {}
    for key in KEYS:
        if environ.get(key):
            values[key] = environ[key]
    if not all(values.get(key) for key in KEYS):
        return None
    return Config(values["TURNSTILE_ACCOUNT_ID"], values["TURNSTILE_SITEKEY"], values["TURNSTILE_API_TOKEN"])


def covered(domain: str, entries: Iterable[str]) -> bool:
    """A widget hostname covers itself and every subdomain of it."""
    return any(domain == entry or domain.endswith("." + entry) for entry in entries)


def missing_domains(wanted: Iterable[str], entries: list) -> list:
    """The wanted domains not yet covered, without any another one covers.

    `example.net` covers `a.example.net`, so when both are wanted only the
    apex takes a slot: the widget holds at most 10 hostnames.
    """
    missing = {d for d in wanted if not covered(d, entries)}
    return sorted(d for d in missing if not covered(d, [m for m in missing if m != d]))


def put_body(widget: dict, domains: list) -> dict:
    body = {key: widget[key] for key in CARRIED if key in widget}
    body.update({key: True for key in ENTERPRISE_FLAGS if widget.get(key) is True})
    body["domains"] = domains
    return body


def http_json(method: str, url: str, token: str, body: Optional[dict] = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return json.load(res)
    except urllib.error.HTTPError as e:
        # Cloudflare answers errors with a JSON body that names the code.
        try:
            return json.load(e)
        except Exception:
            return {"success": False, "errors": [{"code": e.code, "message": str(e)}]}


def _errors(response: dict) -> str:
    return "; ".join(f"{e.get('code')}: {e.get('message')}" for e in response.get("errors") or []) or "no detail"


def reconcile(wanted: Iterable[str], config: Config, http: Http, log: Log, dry_run: bool = False) -> list:
    """Add the wanted custom domains the widget does not cover. Returns those added."""
    wanted = sorted(set(wanted))
    if not wanted:
        return []
    url = f"{API}/accounts/{config.account_id}/challenges/widgets/{config.sitekey}"
    try:
        current = http("GET", url, config.token)
        if not current.get("success"):
            log(f"TURNSTILE FAILED reading the widget: {_errors(current)}")
            return []
        widget = current["result"]
        before = list(widget.get("domains") or [])
        missing = missing_domains(wanted, before)
        if not missing:
            return []
        if dry_run:
            log(f"DRY-RUN would add to Turnstile widget: {', '.join(missing)}")
            return []
        room = max(0, MAX_DOMAINS - len(set(before)))
        fits = missing[:room]
        # Every tenant still without cover, not only the hostnames that asked
        # for a slot: a subdomain whose apex did not fit is uncovered too.
        uncovered = [d for d in wanted if not covered(d, before + fits)]
        if uncovered:
            log(
                f"TURNSTILE FAILED: the widget holds at most {MAX_DOMAINS} hostnames, so these stay "
                f"uncovered: {', '.join(uncovered)}; move some tenants to a second widget."
            )
        if not fits:
            return []
        missing = fits
        domains = sorted(set(before) | set(missing))
        updated = http("PUT", url, config.token, put_body(widget, domains))
        if not updated.get("success"):
            log(f"TURNSTILE FAILED adding {', '.join(missing)}: {_errors(updated)}")
            return []
        try:
            after = http("GET", url, config.token)
        except Exception as e:  # the write went through; only the check failed
            after = {"success": False, "errors": [{"code": type(e).__name__, "message": str(e)}]}
        if not after.get("success"):
            # The write was accepted; only the check failed. Say that, rather
            # than report every hostname on the widget as lost.
            log(
                f"TURNSTILE FAILED: added {', '.join(missing)}, but the result could not be checked: "
                f"{_errors(after)}"
            )
            return missing
        stored = set((after.get("result") or {}).get("domains") or [])
        lost = sorted(set(domains) - stored)
        if lost:
            log(f"TURNSTILE FAILED: after the update the widget lacks {', '.join(lost)}")
            return [d for d in missing if d in stored]
        log(f"Added to Turnstile widget: {', '.join(missing)}")
        return missing
    except Exception as e:  # never let the widget break the vhost sync
        log(f"TURNSTILE FAILED: {type(e).__name__}: {e}")
        return []
