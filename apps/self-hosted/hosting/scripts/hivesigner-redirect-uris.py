#!/usr/bin/env python3
"""
Reconcile the Hivesigner app account's redirect_uris against the live tenants.

Hivesigner validates an OAuth callback with an exact string match against the
app account's on-chain posting_json_metadata. From hivesigner-ui's login page:

    if (!this.appProfile.redirect_uris.includes(this.callback) || ...)

Array.includes. No wildcards, no prefix match, no origin-only match. So an
instance whose /auth URI is not listed verbatim cannot complete a Hivesigner
login, which is why the self-hosted app hides the method unless the instance
names a client of its own.

This produces the metadata that would register every live instance. It does not
broadcast: updating posting_json_metadata needs the app account's posting key,
and the hosting service deliberately holds no signing key of any kind. Someone
who holds the key runs the broadcast, with this output as the payload.

Existing entries are never dropped. The output is the current array plus
whatever is missing, so a URI added by hand for something this script does not
know about survives.

The payload is written to a file rather than stdout. The account's existing
profile is carried through unchanged, and on a Hivesigner app profile that
includes an app secret, so echoing the payload would put it into terminal
history, shell logs and any CI transcript that ran this. The summary on stdout
is safe to paste; the file is not.

Usage:
    hivesigner-redirect-uris.py [--account ecency.app] [--base-domain blogs.ecency.com]
                               [--database-url postgres://...] [--out PATH]

Exit codes: 0 nothing to add, 10 additions needed, 1 error.
"""

from __future__ import annotations

import argparse
import json
import os
import stat
import sys
import tempfile
import urllib.request

DEFAULT_ACCOUNT = "ecency.app"
DEFAULT_BASE_DOMAIN = "blogs.ecency.com"
DEFAULT_RPC = "https://api.hive.blog"

# Only these pay for a working login. A lapsed instance keeps serving, but
# registering it spends metadata bytes on a site nobody is maintaining, and the
# array is a shared resource.
LIVE_STATUSES = ("active", "trialing")


def fetch_account(rpc: str, account: str) -> dict:
    payload = json.dumps(
        {
            "jsonrpc": "2.0",
            "method": "condenser_api.get_accounts",
            "params": [[account]],
            "id": 1,
        }
    ).encode()
    request = urllib.request.Request(
        rpc, data=payload, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        result = json.load(response).get("result") or []
    if not result:
        raise SystemExit(f"account {account} does not exist")
    return result[0]


def current_metadata(account: dict) -> tuple[dict, list[str]]:
    metadata = json.loads(account.get("posting_json_metadata") or "{}")
    profile = metadata.get("profile") or {}
    uris = profile.get("redirect_uris") or []
    if not isinstance(uris, list):
        raise SystemExit("redirect_uris on the account is not an array; refusing to guess")
    return metadata, [u for u in uris if isinstance(u, str)]


def wanted_uris(database_url: str, base_domain: str) -> list[str]:
    try:
        import psycopg
    except ImportError:  # pragma: no cover - depends on the operator's box
        raise SystemExit("psycopg is required: pip install 'psycopg[binary]'")

    uris: list[str] = []
    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT username, custom_domain, custom_domain_verified
                  FROM tenants
                 WHERE subscription_status = ANY(%s)
                 ORDER BY username
                """,
                (list(LIVE_STATUSES),),
            )
            for username, custom_domain, verified in cursor.fetchall():
                uris.append(f"https://{username}.{base_domain}/auth")
                # An unverified claim is not the tenant's domain yet. Registering
                # it would let whoever actually controls that name receive
                # callbacks for the app.
                if custom_domain and verified:
                    uris.append(f"https://{custom_domain}/auth")
    return uris


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--account", default=os.environ.get("HIVESIGNER_APP_ACCOUNT", DEFAULT_ACCOUNT))
    parser.add_argument("--base-domain", default=os.environ.get("BASE_DOMAIN", DEFAULT_BASE_DOMAIN))
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    parser.add_argument("--rpc", default=os.environ.get("HIVE_RPC", DEFAULT_RPC))
    parser.add_argument(
        "--out",
        help="where to write the broadcast payload (default: a 0600 temp file)",
    )
    args = parser.parse_args()

    if not args.database_url:
        raise SystemExit("--database-url or DATABASE_URL is required")

    account = fetch_account(args.rpc, args.account)
    metadata, existing = current_metadata(account)
    wanted = wanted_uris(args.database_url, args.base_domain)

    missing = [u for u in wanted if u not in existing]
    merged = existing + missing

    metadata.setdefault("profile", {})["redirect_uris"] = merged
    serialized = json.dumps(metadata, separators=(",", ":"))

    print(f"account:    {args.account}")
    print(f"registered: {len(existing)}")
    print(f"to add:     {len(missing)}")
    print(f"final:      {len(merged)}")
    print(f"metadata:   {len(serialized)} bytes")

    if missing:
        print("\nwould add:")
        for uri in missing:
            print(f"  {uri}")

        path = args.out
        if path is None:
            handle, path = tempfile.mkstemp(prefix="hivesigner-metadata-", suffix=".json")
            os.close(handle)
        with open(path, "w", encoding="utf-8") as payload:
            payload.write(serialized)
        os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)

        print(f"\npayload written to {path}")
        print("broadcast it as posting_json_metadata (account_update2, posting authority).")
        print("it carries the account's existing profile, including its app secret, so do")
        print("not paste it into a shared terminal and delete it when you are done.")
        # Stale entries are reported, never removed: one may be a hand-added URI
        # for something outside this script's view, and dropping it silently
        # breaks a login nobody will connect back to this run.
        stale = [u for u in existing if u.endswith(f".{args.base_domain}/auth") and u not in wanted]
        if stale:
            print("\nregistered but no longer live, review by hand before removing:")
            for uri in stale:
                print(f"  {uri}")
        return 10

    print("\nnothing to add")
    return 0


if __name__ == "__main__":
    sys.exit(main())
