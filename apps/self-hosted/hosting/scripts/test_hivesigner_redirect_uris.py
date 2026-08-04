"""
Tests for the pure parts of the Hivesigner redirect-URI registration job.

Nothing here touches the database, the chain or the hosting API: the pieces that
do are thin wrappers, and the parts that decide what may be written to an account
every hosted blog's login depends on are the ones worth holding still.

stdlib unittest, no dependencies, because this script runs on a host that has
only what an operator installed for it and CI should not need more than python3
to check it.

    python3 -m unittest discover -p 'test_*.py'
"""

import fcntl
import json
import os
import stat
import sys
import tempfile
import types
import unittest

# The script is not importable by name (it has a dash and no .py-module identity),
# so it is compiled from source here.
#
# Deliberately NOT loaded through importlib's file loader. That caches bytecode in
# __pycache__ keyed on the source's mtime and size, and a same-second edit that
# does not change the length silently reuses the stale copy: after a run that
# flipped `SystemExit(0)` to `SystemExit(1)` and put the original back, the tests
# went on testing the flipped version and reported a failure that was not in the
# file. Compiling the bytes that are on disk, every time, cannot do that, and
# leaves nothing behind in the working tree either.
_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hivesigner-redirect-uris.py")
registrar = types.ModuleType("hivesigner_redirect_uris")
registrar.__file__ = _PATH
with open(_PATH, encoding="utf-8") as _source:
    exec(compile(_source.read(), _PATH, "exec"), registrar.__dict__)

BASE = "blogs.ecency.com"


class SafeRedirectUri(unittest.TestCase):
    """
    Everything on redirect_uris can receive an OAuth callback carrying an access
    token for the app, so this is the last check before a name becomes able to.
    """

    def accepts(self, uri):
        self.assertTrue(registrar.is_safe_redirect_uri(uri, BASE), uri)

    def refuses(self, uri):
        self.assertFalse(registrar.is_safe_redirect_uri(uri, BASE), uri)

    def test_accepts_a_tenant_subdomain(self):
        self.accepts("https://alice.blogs.ecency.com/auth")

    def test_accepts_a_dotted_account_name_two_labels_deep(self):
        # A Hive account may contain a dot, and that tenant's blog lives two
        # labels under the base domain.
        self.accepts("https://louis.random.blogs.ecency.com/auth")

    def test_accepts_a_custom_domain(self):
        self.accepts("https://blog.example.org/auth")

    def test_refuses_plain_http(self):
        self.refuses("http://alice.blogs.ecency.com/auth")

    def test_refuses_any_path_other_than_the_callback(self):
        self.refuses("https://alice.blogs.ecency.com/")
        self.refuses("https://alice.blogs.ecency.com/auth/")
        self.refuses("https://alice.blogs.ecency.com/auth/extra")

    def test_refuses_a_query_or_fragment(self):
        self.refuses("https://alice.blogs.ecency.com/auth?next=x")
        self.refuses("https://alice.blogs.ecency.com/auth#x")

    def test_refuses_embedded_credentials(self):
        # https://ecency.com@evil.example/auth reads as ecency.com to a person
        # skimming the array and as evil.example to everything else.
        self.refuses("https://ecency.com@evil.example/auth")

    def test_refuses_a_port(self):
        self.refuses("https://alice.blogs.ecency.com:8443/auth")

    def test_refuses_a_malformed_port(self):
        self.refuses("https://alice.blogs.ecency.com:notaport/auth")

    def test_refuses_mixed_case_since_the_match_on_chain_is_exact(self):
        self.refuses("https://Alice.blogs.ecency.com/auth")

    def test_refuses_ecency_com_and_anything_under_it(self):
        # A custom domain is never ours; one claiming to be would take callbacks
        # for the first-party app.
        self.refuses("https://ecency.com/auth")
        self.refuses("https://alpha.ecency.com/auth")
        self.refuses("https://notblogs.ecency.com/auth")

    def test_refuses_the_base_domain_itself(self):
        self.refuses("https://blogs.ecency.com/auth")

    def test_refuses_a_hostname_that_is_not_a_hostname(self):
        self.refuses("https://-bad-.example/auth")
        self.refuses("https://localhost/auth")


class MergeUris(unittest.TestCase):
    def test_reports_what_is_missing_and_appends_it(self):
        missing, merged = registrar.merge_uris(["https://a/auth"], ["https://a/auth", "https://b/auth"])
        self.assertEqual(missing, ["https://b/auth"])
        self.assertEqual(merged, ["https://a/auth", "https://b/auth"])

    def test_never_drops_an_entry_it_did_not_ask_for(self):
        # A URI added by hand for something outside this script's view survives.
        _, merged = registrar.merge_uris(["https://manual/auth"], ["https://a/auth"])
        self.assertIn("https://manual/auth", merged)

    def test_is_idempotent(self):
        first_missing, merged = registrar.merge_uris([], ["https://a/auth"])
        second_missing, again = registrar.merge_uris(merged, ["https://a/auth"])
        self.assertEqual(first_missing, ["https://a/auth"])
        self.assertEqual(second_missing, [])
        self.assertEqual(again, merged)

    def test_does_not_add_the_same_uri_twice_in_one_pass(self):
        missing, merged = registrar.merge_uris([], ["https://a/auth", "https://a/auth"])
        self.assertEqual(missing, ["https://a/auth"])
        self.assertEqual(merged, ["https://a/auth"])

    def test_preserves_the_order_of_what_is_already_registered(self):
        _, merged = registrar.merge_uris(["https://b/auth", "https://a/auth"], ["https://c/auth"])
        self.assertEqual(merged, ["https://b/auth", "https://a/auth", "https://c/auth"])


class CurrentMetadata(unittest.TestCase):
    def test_reads_the_registered_array(self):
        metadata, uris = registrar.current_metadata(
            {"posting_json_metadata": '{"profile":{"redirect_uris":["https://a/auth"]}}'}
        )
        self.assertEqual(uris, ["https://a/auth"])
        self.assertEqual(metadata["profile"]["redirect_uris"], ["https://a/auth"])

    def test_keeps_the_rest_of_the_profile(self):
        metadata, _ = registrar.current_metadata(
            {"posting_json_metadata": '{"profile":{"name":"App","redirect_uris":[]}}'}
        )
        self.assertEqual(metadata["profile"]["name"], "App")

    def test_treats_an_account_with_no_metadata_as_registering_nothing(self):
        _, uris = registrar.current_metadata({})
        self.assertEqual(uris, [])

    def test_refuses_to_guess_when_redirect_uris_is_not_an_array(self):
        with self.assertRaises(SystemExit):
            registrar.current_metadata(
                {"posting_json_metadata": '{"profile":{"redirect_uris":"https://a/auth"}}'}
            )


class ReadSecretFile(unittest.TestCase):
    def write(self, contents, mode):
        handle, path = tempfile.mkstemp()
        with os.fdopen(handle, "w") as f:
            f.write(contents)
        os.chmod(path, mode)
        self.addCleanup(os.unlink, path)
        return path

    def test_reads_an_owner_only_file(self):
        path = self.write("  secret-value\n", stat.S_IRUSR | stat.S_IWUSR)
        self.assertEqual(registrar.read_secret_file(path, "posting key"), "secret-value")

    def test_refuses_a_group_or_world_readable_file(self):
        for mode in (0o640, 0o604, 0o644):
            path = self.write("secret-value", mode)
            with self.assertRaises(SystemExit) as caught:
                registrar.read_secret_file(path, "posting key")
            # The message must name the problem without quoting the value.
            self.assertNotIn("secret-value", str(caught.exception))

    def test_refuses_an_empty_file(self):
        path = self.write("\n", stat.S_IRUSR | stat.S_IWUSR)
        with self.assertRaises(SystemExit):
            registrar.read_secret_file(path, "posting key")

    def test_refuses_a_file_that_is_not_there(self):
        with self.assertRaises(SystemExit):
            registrar.read_secret_file("/nonexistent/posting.key", "posting key")


class RpcErrors(unittest.TestCase):
    """
    A node that answers with an error must not read as an empty answer. That
    turned every node fault into "the app account does not exist", which is the
    wrong diagnosis and, being a SystemExit, could not be retried during
    confirmation either.
    """

    def call(self, body):
        captured = {}

        class FakeResponse:
            def __enter__(self_inner):
                return self_inner

            def __exit__(self_inner, *exc):
                return False

            def read(self_inner):
                return body.encode()

        original = registrar.urllib.request.urlopen
        registrar.urllib.request.urlopen = lambda *a, **k: FakeResponse()
        self.addCleanup(setattr, registrar.urllib.request, "urlopen", original)
        captured["result"] = registrar.rpc("https://node.example", "m", [])
        return captured["result"]

    def test_returns_the_body_on_success(self):
        self.assertEqual(self.call('{"result": [1]}')["result"], [1])

    def test_raises_on_a_json_rpc_error_member(self):
        with self.assertRaises(registrar.RpcError):
            self.call('{"error": {"message": "server busy"}}')

    def test_repeats_what_the_node_actually_said(self):
        # The missing-result check below would also refuse this body, so what the
        # error member buys is the diagnosis. Without it the operator reads
        # "response carried neither result nor error" and goes looking for a bug
        # here instead of at the node that told them why.
        with self.assertRaises(registrar.RpcError) as caught:
            self.call('{"error": {"message": "server busy"}}')
        self.assertIn("server busy", str(caught.exception))

    def test_raises_on_a_response_with_neither_result_nor_error(self):
        with self.assertRaises(registrar.RpcError):
            self.call("{}")

    def test_an_rpc_error_is_retryable_during_confirmation(self):
        # confirm_registered only retries what it catches, so RpcError has to be
        # in that set or a blip ends the run.
        import inspect

        source = inspect.getsource(registrar.confirm_registered)
        self.assertIn("RpcError", source.split("except")[1].split(":")[0])


class BroadcastMetadata(unittest.TestCase):
    """
    The one operation here that changes something on a live account, and the one
    whose mistakes are not undoable by running it again.
    """

    def broadcast(self, json_metadata):
        sent = {}

        class FakeClient:
            def __init__(self_inner, nodes=None, keys=None):
                sent["nodes"] = nodes
                sent["keys"] = keys

            def broadcast_sync(self_inner, op):
                sent["op"] = op.to_dict()

        class FakeOperation:
            def __init__(self_inner, type_, value):
                self_inner.type = type_
                self_inner.value = value

            def to_dict(self_inner):
                return [self_inner.type, self_inner.value]

        client_mod = types.ModuleType("lighthive.client")
        client_mod.Client = FakeClient
        data_mod = types.ModuleType("lighthive.datastructures")
        data_mod.Operation = FakeOperation
        package = types.ModuleType("lighthive")
        for name, module in (
            ("lighthive", package),
            ("lighthive.client", client_mod),
            ("lighthive.datastructures", data_mod),
        ):
            sys.modules[name] = module
            self.addCleanup(sys.modules.pop, name, None)

        registrar.broadcast_metadata("app", '{"profile":{}}', json_metadata, "wif", ["n"])
        return sent

    def test_updates_the_posting_copy(self):
        sent = self.broadcast("")
        self.assertEqual(sent["op"][0], "account_update2")
        self.assertEqual(sent["op"][1]["posting_json_metadata"], '{"profile":{}}')

    def test_echoes_the_accounts_existing_json_metadata_back(self):
        # Sending an empty string here would rely on the evaluator treating it as
        # "leave alone". If that reading is ever wrong, or ever changes, the app
        # account's global metadata is erased and cannot be recovered from here.
        sent = self.broadcast('{"keep":"me"}')
        self.assertEqual(sent["op"][1]["json_metadata"], '{"keep":"me"}')

    def test_does_not_put_the_key_in_the_operation(self):
        sent = self.broadcast("")
        self.assertNotIn("wif", json.dumps(sent["op"]))


class SecretSafeBase(unittest.TestCase):
    """
    The shared secret goes out as a request header, so the base it is sent to
    decides whether it crosses a network in the clear.
    """

    def test_accepts_https(self):
        registrar.assert_secret_safe_base("https://api.example")

    def test_accepts_http_on_loopback(self):
        # No network path, so nothing to intercept.
        registrar.assert_secret_safe_base("http://127.0.0.1:3001")
        registrar.assert_secret_safe_base("http://localhost:3001")

    def test_refuses_plain_http_to_a_remote_host(self):
        with self.assertRaises(SystemExit):
            registrar.assert_secret_safe_base("http://api.example")

    def test_refuses_a_scheme_that_is_neither(self):
        for base in ("ftp://api.example", "api.example", ""):
            with self.assertRaises(SystemExit):
                registrar.assert_secret_safe_base(base)

    def test_refuses_to_follow_a_redirect(self):
        # urllib re-sends headers to wherever a redirect points, and one of them
        # is the secret, so anything able to answer could collect it with a 302.
        handler = registrar._RefuseRedirects()
        with self.assertRaises(registrar.urllib.error.URLError):
            handler.redirect_request(None, None, 302, "Found", {}, "http://evil.example/")


class AcquireLock(unittest.TestCase):
    """
    The lock is what keeps two runs from each merging onto the state they read
    and the later broadcast losing the earlier one's entries.
    """

    def setUp(self):
        handle, path = tempfile.mkstemp()
        os.close(handle)
        self.path = path
        self.original = registrar.LOCK_FILE
        registrar.LOCK_FILE = path
        self.addCleanup(self.restore)

    def restore(self):
        registrar.LOCK_FILE = self.original
        if registrar._LOCK_HANDLE is not None:
            registrar._LOCK_HANDLE.close()
            registrar._LOCK_HANDLE = None
        os.unlink(self.path)

    def held(self):
        """Whether anything currently holds an exclusive flock on the lock file."""
        with open(self.path, "w", encoding="utf-8") as other:
            try:
                fcntl.flock(other, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                return True
            fcntl.flock(other, fcntl.LOCK_UN)
            return False

    def test_nothing_holds_the_lock_to_begin_with(self):
        self.assertFalse(self.held())

    def test_the_lock_outlives_the_call(self):
        # The regression this exists for: acquire_lock used to RETURN the handle
        # and the caller dropped it, so CPython closed the file and released the
        # flock before the first read. The lock was taken and given straight back
        # while everything still looked like it was working.
        registrar.acquire_lock()
        self.assertTrue(self.held())

    def test_a_second_run_exits_quietly_rather_than_waiting(self):
        registrar.acquire_lock()
        # A pass skipped because the previous one is still going is not a fault,
        # so a timer must not see it as one.
        with self.assertRaises(SystemExit) as caught:
            registrar.acquire_lock()
        self.assertEqual(caught.exception.code, 0)


class Statuses(unittest.TestCase):
    def test_registers_only_tenants_the_api_will_serve(self):
        # The hosting API writes a client id only for an 'active' tenant, and the
        # array only ever grows, so anything else spends metadata bytes forever
        # on a login that is never enabled.
        self.assertEqual(registrar.LIVE_STATUSES, ("active",))


if __name__ == "__main__":
    unittest.main()
