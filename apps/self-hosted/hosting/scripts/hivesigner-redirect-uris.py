#!/usr/bin/env python3
"""
Keep the Hivesigner app account's redirect_uris in step with the live tenants,
and turn the login method on for exactly the instances that are registered.

Hivesigner validates an OAuth callback with an exact string match against the
app account's on-chain posting_json_metadata. From hivesigner-ui's login page:

    if (!this.appProfile.redirect_uris.includes(this.callback) || ...)

Array.includes. No wildcards, no prefix match, no origin-only match. So an
instance whose /auth URI is not listed verbatim cannot complete a Hivesigner
login, which is why the self-hosted app hides the method unless the instance
names a client of its own.

Two halves, and they must not be able to disagree. A client id on an instance
whose URI is not registered is a login button that leads to an error page with
no explanation, which is the state this whole exercise exists to avoid. So:

  1. append every missing URI to the account's redirect_uris (a posting-authority
     broadcast, which is why this runs where a key may live and not inside the
     hosting service, which is internet-facing and has never held one);
  2. confirm the array on chain actually carries them;
  3. ask the hosting API to reconcile the tenant client ids.

Step 3 sends no tenant list and no client id. The API re-reads the chain itself
and derives each tenant's required URIs from its own row, so the only thing that
can enable an instance is its registration, and a run that dies between 1 and 3
is repaired by the next run rather than by a person.

Without --broadcast this only reports and writes the payload someone else would
broadcast, which is what it did before there was anywhere to run it unattended.

The payload is written to a file rather than stdout. The account's existing
profile is carried through unchanged, and on a Hivesigner app profile that
includes an app secret, so echoing the payload would put it into terminal
history, shell logs and any CI transcript that ran this. The summary on stdout
is safe to paste; the file is not.

Usage:
    # report only, write the payload for a manual broadcast
    hivesigner-redirect-uris.py --database-url postgres://...

    # unattended: register, confirm, enable (this is what the timer runs)
    hivesigner-redirect-uris.py --broadcast --key-file <path> \\
        --api-base <hosting api> --internal-secret-file <path>

Exit codes:
    report mode:    0 nothing to add, 10 additions needed, 1 error
    --broadcast:    0 converged, 1 error (a timer treats anything else as a failure)
"""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import re
import stat
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_ACCOUNT = "ecency.app"
DEFAULT_BASE_DOMAIN = "blogs.ecency.com"
DEFAULT_RPC = "https://api.hive.blog"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOCK_FILE = os.path.join(BASE_DIR, ".hivesigner-redirect-uris.lock")

# The array only ever grows here, so registering a tenant that is not currently
# served costs metadata bytes on the app account forever and buys nothing: the
# hosting API only writes a client id for a tenant it is willing to serve, which
# is 'active' and nothing else. An earlier version of this listed 'trialing',
# which is not a status this schema has ever had, so it matched no rows at all.
LIVE_STATUSES = ("active",)

# Hostname shape, matching what the hosting API accepts for a custom domain.
DOMAIN_RE = re.compile(r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$")

# Where the SPA takes a Hivesigner callback.
REDIRECT_PATH = "/auth"

# A single run adds one entry per new instance. A number far above that is not a
# busy afternoon, it is a bug or a bad query, and this writes to an account whose
# metadata every hosted blog's login depends on. Refused rather than truncated: a
# half-applied array is harder to reason about than one that was never touched.
DEFAULT_MAX_ADDITIONS = 50

# posting_json_metadata is a string field in a signed transaction. Well under any
# hard limit, but a runaway array should stop here rather than at the node.
MAX_METADATA_BYTES = 60_000

# How long to wait for the broadcast to show up in a subsequent read. A block is
# three seconds, and the node answering the read may not be the node that took
# the broadcast.
CONFIRM_ATTEMPTS = 8
CONFIRM_DELAY_SECONDS = 3


def log(message: str) -> None:
    print(message, flush=True)


class RpcError(Exception):
    """
    A node answered, and what it said was an error.

    Its own type because the alternative was reading a response with no `result`
    as an empty one. That turned every node fault into "account does not exist",
    which is both the wrong diagnosis and unretryable, so a blip during
    confirmation ended the run claiming the app account was gone.
    """


def rpc(url: str, method: str, params: list) -> dict:
    payload = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": 1}).encode()
    request = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=30) as response:
        body = json.load(response)
    if "error" in body:
        raise RpcError(f"{method}: {body['error']}")
    if "result" not in body:
        raise RpcError(f"{method}: response carried neither result nor error")
    return body


def fetch_account(rpc_url: str, account: str) -> dict:
    result = rpc(rpc_url, "condenser_api.get_accounts", [[account]])["result"] or []
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


def is_safe_redirect_uri(uri: str, base_domain: str) -> bool:
    """
    Whether a URI may be put on the app account.

    Everything on that array can receive an OAuth callback carrying an access
    token for the app, so this is the last check before a name becomes able to.
    The database is the authority on WHICH hosts belong to tenants; this is the
    shape check that stops a malformed or surprising value from getting there:
    exactly https, exactly the callback path, no credentials, no port, no query,
    and nothing under ecency.com that is not a tenant subdomain.
    """
    parts = urllib.parse.urlsplit(uri)
    if parts.scheme != "https":
        return False
    if parts.path != REDIRECT_PATH:
        return False
    if parts.query or parts.fragment:
        return False

    # urlsplit lower-cases the hostname and strips any userinfo and port from it,
    # so requiring the authority to be EXACTLY the hostname rejects all three at
    # once: https://ecency.com@evil.example/auth (reads as ours to anyone
    # skimming the array, resolves as theirs), any :port, and a mixed-case host
    # that could never match the exact string comparison Hivesigner performs.
    #
    # Written as one check rather than as separate tests for username, password,
    # port and case. Those were all here, and none of them could ever fire,
    # because this comparison had already refused every input that would have
    # reached them. Four checks where one is load-bearing reads as depth and is
    # not: the next person removes the one that works and the tests stay green.
    host = parts.hostname or ""
    if not host or host != parts.netloc:
        return False
    if not DOMAIN_RE.match(host):
        return False
    if host.endswith(f".{base_domain}"):
        return True
    # Anything else has to be a custom domain, and a custom domain is never ours.
    # hosting/origin/sync-custom-domains.py refuses these for the same reason.
    return host != "ecency.com" and not host.endswith(".ecency.com")


def wanted_uris(database_url: str, base_domain: str) -> list[str]:
    """
    The URIs every served instance needs, derived from the tenant table.

    Mirrored by tenantRedirectUris() in the hosting API, which decides which
    tenants may have a client id. The two are allowed to drift only in the safe
    direction: the API checks the chain for what it REQUIRES, so registering too
    little leaves the method off and registering too much enables nothing extra.

    One config file serves the subdomain AND the verified custom domain, and the
    SPA builds its redirect_uri from window.location.origin, so both have to be
    here or the API will not enable either of them.
    """
    try:
        import psycopg
    except ImportError:  # pragma: no cover - depends on the operator's box
        raise SystemExit("psycopg is required: pip install 'psycopg[binary]'") from None

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
                uris.append(f"https://{username.lower()}.{base_domain}{REDIRECT_PATH}")
                # An unverified claim is not the tenant's domain yet. Registering
                # it would let whoever actually controls that name receive
                # callbacks for the app.
                if custom_domain and verified:
                    uris.append(f"https://{custom_domain.lower()}{REDIRECT_PATH}")
    return uris


def merge_uris(existing: list[str], wanted: list[str]) -> tuple[list[str], list[str]]:
    """
    What is missing, and the array that would replace the current one.

    Purely additive. Existing entries are never dropped, so a URI added by hand
    for something this script does not know about survives, and an entry that is
    already there is never duplicated however many times it is asked for.
    """
    missing: list[str] = []
    seen = set(existing)
    for uri in wanted:
        if uri in seen:
            continue
        seen.add(uri)
        missing.append(uri)
    return missing, existing + missing


def read_secret_file(path: str, label: str) -> str:
    """
    Read a credential from a file, refusing one anything on the box can read.

    A key or shared secret left group- or world-readable is the kind of thing
    that is noticed after it has been used, so this is a hard failure rather
    than a warning. The value is never echoed, and never appears in an error.
    """
    try:
        mode = os.stat(path).st_mode
    except OSError as error:
        raise SystemExit(f"cannot read the {label} file: {error.strerror}") from error
    if mode & (stat.S_IRWXG | stat.S_IRWXO):
        raise SystemExit(f"the {label} file is readable by group or other; chmod 600 it")
    with open(path, encoding="utf-8") as handle:
        value = handle.read().strip()
    if not value:
        raise SystemExit(f"the {label} file is empty")
    return value


def write_private(contents: str, path: str | None) -> str:
    """
    Write to a file only its owner can read, with no window where it is not.

    Creating the file and then chmod-ing it leaves the payload readable by
    anything on the box for the interval between the two, and world-readable
    forever if the process dies in between. The mode has to be applied by the
    call that creates the file.
    """
    if path is None:
        handle, path = tempfile.mkstemp(prefix="hivesigner-metadata-", suffix=".json")
    else:
        # O_CREAT with mode 0600. An existing file keeps its own mode, so the
        # caller owns that choice; a new one is never briefly readable.
        handle = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, stat.S_IRUSR | stat.S_IWUSR)

    with os.fdopen(handle, "w", encoding="utf-8") as payload:
        payload.write(contents)
    return path


def broadcast_metadata(account: str, serialized: str, key: str, nodes: list[str]) -> None:
    """
    Update the account's posting_json_metadata.

    json_metadata is sent EMPTY, and must be. hived requires the account's
    active authority for an account_update2 whose json_metadata is non-empty,
    whatever it contains, and only the posting authority when it is empty; an
    empty string leaves the field on chain untouched. An earlier version echoed
    the account's current json_metadata back "to be safe", and the node refused
    it with "Missing Active Authority": this runs with a posting key, and a
    posting key is all it should ever hold.

    lighthive serializes through the node's own get_transaction_hex, so this needs
    no client-side operation table that could fall behind the chain.
    """
    try:
        from lighthive.client import Client
        from lighthive.datastructures import Operation
    except ImportError:  # pragma: no cover - depends on the operator's box
        raise SystemExit("lighthive is required to broadcast: pip install lighthive") from None

    client = Client(nodes=nodes, keys=[key])
    client.broadcast_sync(
        Operation(
            "account_update2",
            {
                "account": account,
                "json_metadata": "",
                "posting_json_metadata": serialized,
                "extensions": [],
            },
        )
    )


def confirm_registered(rpc_url: str, account: str, wanted: list[str]) -> list[str]:
    """
    Re-read the array until it carries everything, and return what is on chain.

    A broadcast that was accepted is not yet a fact anyone else can see: it has
    to land in a block, and the node answering this read may not be the node that
    took it. Reporting success from the broadcast call alone would let a client
    id be written for a URI that never made it, which is the one outcome that
    must be impossible.
    """
    seen: list[str] = []
    for attempt in range(CONFIRM_ATTEMPTS):
        if attempt:
            time.sleep(CONFIRM_DELAY_SECONDS)
        try:
            _, seen = current_metadata(fetch_account(rpc_url, account))
        except (urllib.error.URLError, TimeoutError, ValueError, RpcError) as error:
            log(f"  confirmation read failed ({error}), retrying")
            continue
        if all(uri in seen for uri in wanted):
            return seen
    missing = [uri for uri in wanted if uri not in seen]
    raise SystemExit(
        "broadcast did not appear on chain after "
        f"{CONFIRM_ATTEMPTS * CONFIRM_DELAY_SECONDS}s; {len(missing)} URI(s) still missing"
    )


class _RefuseRedirects(urllib.request.HTTPRedirectHandler):
    """
    Turn a redirect into an error instead of following it.

    urllib re-sends the request headers to whatever a redirect names, and one of
    those headers is the shared secret. Anything able to answer this call could
    then collect it by replying 302, so the reconcile does not follow redirects
    at all: the endpoint it wants is a fixed path on a host the operator named.
    """

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.URLError(f"refusing to follow a redirect to {newurl}")


def assert_secret_safe_base(api_base: str) -> None:
    """
    Refuse to put the shared secret on a cleartext connection.

    The secret authenticates every internal call to the hosting API, and this
    sends it as a request header. Over plain http on the network that is simply
    handing it to anyone on the path. Loopback is allowed because there is no
    path: an operator running this beside the API is talking to the same kernel.
    """
    parts = urllib.parse.urlsplit(api_base)
    if parts.scheme == "https":
        return
    if parts.scheme == "http" and (parts.hostname or "") in ("127.0.0.1", "::1", "localhost"):
        return
    raise SystemExit(
        "--api-base must be https, or http on loopback; the internal secret is sent "
        "as a header and plain http over the network exposes it"
    )


def reconcile_client_ids(api_base: str, secret: str) -> dict:
    """
    Ask the hosting API to bring tenant client ids into step with the chain.

    Deliberately sends nothing. The API decides what to enable by reading the
    chain itself, so this cannot ask it to enable an instance that is not
    registered, and neither can anything that gets hold of this script.
    """
    url = api_base.rstrip("/") + "/v1/internal/hivesigner/reconcile"
    request = urllib.request.Request(
        url,
        data=b"",
        method="POST",
        headers={"Content-Type": "application/json", "x-internal-secret": secret},
    )
    opener = urllib.request.build_opener(_RefuseRedirects)
    with opener.open(request, timeout=120) as response:
        return json.load(response)


# The open file description the run's lock lives on. Parked at module scope
# deliberately: see acquire_lock.
_LOCK_HANDLE = None


def acquire_lock() -> None:
    """
    One run at a time.

    Read-modify-write on the array is not atomic, so two overlapping runs can each
    merge onto the state they read and the later broadcast loses the earlier one's
    entries. That self-heals on the next pass, because every run merges onto
    whatever is on chain at the time and never removes anything, but it costs a
    broadcast and delays a new owner's login, so it is simply prevented. Exits
    quietly: a run skipped because the previous one is still going is not a fault.

    Returns nothing on purpose. A flock lives on the open file description, so it
    is released the moment the last reference to the handle goes away. Handing the
    handle back made staying locked the caller's job, and the caller dropped it on
    the floor: the lock was taken and released before the account was even read,
    and the whole thing looked like it was working. There is now no return value
    to discard, and `test_the_lock_outlives_the_call` fails if this stops holding.
    """
    global _LOCK_HANDLE
    handle = open(LOCK_FILE, "w", encoding="utf-8")
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        handle.close()
        # `from None`: a run skipped because the previous one is still
        # going is the normal case, not a fault, and chaining the
        # BlockingIOError onto it prints a traceback for a clean exit.
        raise SystemExit(0) from None
    _LOCK_HANDLE = handle


def report(account_name: str, existing: list[str], missing: list[str], serialized: str) -> None:
    log(f"account:    {account_name}")
    log(f"registered: {len(existing)}")
    log(f"to add:     {len(missing)}")
    log(f"final:      {len(existing) + len(missing)}")
    log(f"metadata:   {len(serialized)} bytes")
    if missing:
        log("\nwould add:")
        for uri in missing:
            log(f"  {uri}")


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
    parser.add_argument(
        "--broadcast",
        action="store_true",
        help="sign and broadcast the update, then enable the login method for what is registered",
    )
    parser.add_argument(
        "--key-file",
        default=os.environ.get("HIVESIGNER_POSTING_KEY_FILE"),
        help="file holding the app account's posting key (mode 0600)",
    )
    parser.add_argument("--api-base", default=os.environ.get("HOSTING_API_BASE"))
    parser.add_argument(
        "--internal-secret-file",
        default=os.environ.get("HOSTING_INTERNAL_SECRET_FILE"),
        help="file holding the hosting API's shared internal secret (mode 0600)",
    )
    parser.add_argument("--max-additions", type=int, default=DEFAULT_MAX_ADDITIONS)
    args = parser.parse_args()

    if not args.database_url:
        raise SystemExit("--database-url or DATABASE_URL is required")

    key = None
    secret = None
    if args.broadcast:
        # Registering without enabling leaves the work invisible, and enabling
        # without registering is the broken button. Neither half is optional, so
        # a run that could only do one is refused before it does anything.
        if not args.key_file and not os.environ.get("HIVESIGNER_POSTING_KEY"):
            raise SystemExit("--broadcast needs --key-file or HIVESIGNER_POSTING_KEY")
        if not args.api_base:
            raise SystemExit("--broadcast needs --api-base or HOSTING_API_BASE")
        # Checked before the key is read, so a misconfigured base cannot get as
        # far as a broadcast it would then be unable to enable.
        assert_secret_safe_base(args.api_base)
        if not args.internal_secret_file and not os.environ.get("HOSTING_INTERNAL_SECRET"):
            raise SystemExit("--broadcast needs --internal-secret-file or HOSTING_INTERNAL_SECRET")
        key = (
            read_secret_file(args.key_file, "posting key")
            if args.key_file
            else os.environ["HIVESIGNER_POSTING_KEY"].strip()
        )
        secret = (
            read_secret_file(args.internal_secret_file, "internal secret")
            if args.internal_secret_file
            else os.environ["HOSTING_INTERNAL_SECRET"].strip()
        )
        acquire_lock()

    account = fetch_account(args.rpc, args.account)
    metadata, existing = current_metadata(account)
    wanted = wanted_uris(args.database_url, args.base_domain)

    unsafe = [uri for uri in wanted if not is_safe_redirect_uri(uri, args.base_domain)]
    if unsafe:
        raise SystemExit(
            "refusing to register URIs that are not a plain https callback on a tenant host: "
            + ", ".join(unsafe)
        )

    missing, merged = merge_uris(existing, wanted)
    if len(missing) > args.max_additions:
        raise SystemExit(
            f"{len(missing)} additions exceeds the {args.max_additions} cap; "
            "check the tenant query before raising it with --max-additions"
        )

    metadata.setdefault("profile", {})["redirect_uris"] = merged
    serialized = json.dumps(metadata, separators=(",", ":"))

    if len(serialized) > MAX_METADATA_BYTES:
        raise SystemExit(
            f"metadata would be {len(serialized)} bytes, over the {MAX_METADATA_BYTES} cap"
        )

    report(args.account, existing, missing, serialized)

    # Reported whether or not anything is being added. Once every live instance
    # is registered there is nothing to add, and that is exactly when a tenant
    # going inactive would otherwise be reported by nobody.
    stale = [
        u
        for u in existing
        if u.endswith(f".{args.base_domain}{REDIRECT_PATH}") and u not in wanted
    ]
    if stale:
        log("\nregistered but no longer live, review by hand before removing:")
        for uri in stale:
            log(f"  {uri}")

    if not args.broadcast:
        if missing:
            path = write_private(serialized, args.out)
            log(f"\npayload written to {path}")
            log("broadcast it as posting_json_metadata (account_update2, posting authority).")
            log("it carries the account's existing profile, including its app secret, so do")
            log("not paste it into a shared terminal and delete it when you are done.")
            return 10
        log("\nnothing to add")
        return 0

    if missing:
        log(f"\nbroadcasting {len(missing)} addition(s) as {args.account}...")
        broadcast_metadata(args.account, serialized, key, args.rpc.split(","))
        confirm_registered(args.rpc, args.account, wanted)
        log("confirmed on chain")
    else:
        log("\nnothing to add")

    # Runs every pass, not only after a broadcast. This is what repairs a run that
    # registered a URI and then died before the client id was written: the next
    # pass has nothing to add and still reconciles.
    result = reconcile_client_ids(args.api_base, secret)
    log(
        "reconciled client ids: "
        f"{len(result.get('enabled') or [])} enabled, "
        f"{len(result.get('disabled') or [])} disabled, "
        f"{result.get('unchanged', 0)} unchanged, "
        f"{len(result.get('failed') or [])} failed"
    )
    for username in result.get("enabled") or []:
        log(f"  enabled  {username}")
    for username in result.get("disabled") or []:
        log(f"  disabled {username}")

    # A tenant the API could not write is left for the next pass, but a run that
    # ends with work outstanding should not look clean to whatever is watching it.
    if result.get("failed"):
        log(f"\n{len(result['failed'])} tenant(s) failed to update; the next run retries them")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
