"""Tests for turnstile_domains (#1586). stdlib unittest, like hosting/scripts.

Run: cd apps/self-hosted/hosting/origin && python3 -m unittest discover -p 'test_*.py'
"""
import os
import re
import tempfile
import unittest

import turnstile_domains as td

WIDGET = {
    "sitekey": "0x4AAA",
    "name": "Ecency newsletter",
    "mode": "managed",
    "domains": ["blog.hivexplorer.com", "ecency.com"],
    "bot_fight_mode": False,
    "clearance_level": "no_clearance",
    "region": "world",
    "offlabel": False,
    "ephemeral_id": False,
    "created_on": "2026-08-20T00:00:00Z",
    "modified_on": "2026-08-20T00:00:00Z",
}

CONFIG = td.Config(account_id="acc", sitekey="0x4AAA", token="tok")


class FakeApi:
    """Records calls; GET returns the stored widget, PUT stores what it was given."""

    def __init__(self, widget, put_ok=True, put_drops=None):
        self.widget = dict(widget)
        self.calls = []
        self.put_ok = put_ok
        self.put_drops = put_drops or set()

    def __call__(self, method, url, token, body=None):
        self.calls.append((method, url, token, body))
        if method == "GET":
            return {"success": True, "result": dict(self.widget)}
        if method == "PUT":
            if not self.put_ok:
                return {"success": False, "errors": [{"code": 10000, "message": "Authentication error"}]}
            stored = dict(self.widget)
            stored.update(body)
            stored["domains"] = [d for d in body["domains"] if d not in self.put_drops]
            self.widget = stored
            return {"success": True, "result": dict(stored)}
        raise AssertionError(method)

    def puts(self):
        return [c for c in self.calls if c[0] == "PUT"]


def mentions(line, name):
    """True when `name` appears in a log line as a whole hostname."""
    return name in re.findall(r"[a-z0-9.-]+", line)


class Logs(list):
    def __call__(self, msg):
        self.append(msg)


class CoveredTest(unittest.TestCase):
    def test_a_hostname_covers_itself_and_its_subdomains(self):
        self.assertTrue(td.covered("ecency.com", ["ecency.com"]))
        self.assertTrue(td.covered("alice.blogs.ecency.com", ["ecency.com"]))
        self.assertFalse(td.covered("notecency.com", ["ecency.com"]))
        self.assertFalse(td.covered("example.com", ["blog.example.com"]))

    def test_missing_is_sorted_and_deduplicated(self):
        self.assertEqual(
            td.missing_domains(["b.example.org", "a.example.org", "a.example.org", "sub.ecency.com"], ["ecency.com"]),
            ["a.example.org", "b.example.org"],
        )


class PutBodyTest(unittest.TestCase):
    def test_carries_the_settings_a_put_would_otherwise_reset(self):
        body = td.put_body(WIDGET, ["a.example.org", "ecency.com"])
        self.assertEqual(body["domains"], ["a.example.org", "ecency.com"])
        for key in ("name", "mode", "clearance_level"):
            self.assertEqual(body[key], WIDGET[key], key)

    def test_leaves_out_read_only_fields_and_region(self):
        # region cannot be changed after creation, and the update has been seen to
        # refuse it; sitekey and the dates are read-only.
        body = td.put_body(WIDGET, ["ecency.com"])
        for key in ("sitekey", "created_on", "modified_on", "region"):
            self.assertNotIn(key, body)

    def test_sends_enterprise_flags_only_when_they_are_on(self):
        # Off is the default, so leaving them out changes nothing; sending them on
        # a plan without them risks a refused write.
        self.assertNotIn("bot_fight_mode", td.put_body(WIDGET, ["ecency.com"]))
        on = dict(WIDGET, offlabel=True, ephemeral_id=True)
        body = td.put_body(on, ["ecency.com"])
        self.assertIs(body["offlabel"], True)
        self.assertIs(body["ephemeral_id"], True)


class ReconcileTest(unittest.TestCase):
    def test_adds_a_new_custom_domain_and_keeps_every_existing_one(self):
        api, logs = FakeApi(WIDGET), Logs()
        added = td.reconcile(["blog.example.org", "blog.hivexplorer.com"], CONFIG, api, logs)
        self.assertEqual(added, ["blog.example.org"])
        [put] = api.puts()
        self.assertEqual(put[2], "tok")
        self.assertEqual(put[3]["domains"], ["blog.example.org", "blog.hivexplorer.com", "ecency.com"])
        self.assertTrue(put[1].endswith("/accounts/acc/challenges/widgets/0x4AAA"))

    def test_never_removes_a_domain_that_left_the_database(self):
        # Add-only: a tenant that lapsed keeps its entry, so a DB blip can never
        # drop a live tenant's widget hostname.
        api, logs = FakeApi(WIDGET), Logs()
        td.reconcile(["blog.example.org"], CONFIG, api, logs)
        [put] = api.puts()
        self.assertIn("blog.hivexplorer.com", put[3]["domains"])
        self.assertIn("ecency.com", put[3]["domains"])

    def test_does_not_write_when_nothing_is_missing(self):
        api, logs = FakeApi(WIDGET), Logs()
        self.assertEqual(td.reconcile(["blog.hivexplorer.com", "x.blogs.ecency.com"], CONFIG, api, logs), [])
        self.assertEqual(api.puts(), [])

    def test_does_not_call_the_api_without_custom_domains(self):
        api, logs = FakeApi(WIDGET), Logs()
        self.assertEqual(td.reconcile([], CONFIG, api, logs), [])
        self.assertEqual(api.calls, [])

    def test_dry_run_only_logs(self):
        api, logs = FakeApi(WIDGET), Logs()
        self.assertEqual(td.reconcile(["blog.example.org"], CONFIG, api, logs, dry_run=True), [])
        self.assertEqual(api.puts(), [])
        self.assertTrue(any("DRY-RUN" in line and mentions(line, "blog.example.org") for line in logs))

    def test_a_refused_write_is_logged_loudly_and_not_raised(self):
        api, logs = FakeApi(WIDGET, put_ok=False), Logs()
        self.assertEqual(td.reconcile(["blog.example.org"], CONFIG, api, logs), [])
        self.assertTrue(any(line.startswith("TURNSTILE FAILED") and "10000" in line for line in logs))

    def test_a_write_that_lost_a_domain_is_reported(self):
        api, logs = FakeApi(WIDGET, put_drops={"blog.hivexplorer.com"}), Logs()
        td.reconcile(["blog.example.org"], CONFIG, api, logs)
        self.assertTrue(any(line.startswith("TURNSTILE FAILED") and mentions(line, "blog.hivexplorer.com") for line in logs))

    def test_adds_what_fits_under_the_ten_hostname_limit_and_reports_the_rest(self):
        full = dict(WIDGET, domains=[f"t{i}.example.org" for i in range(8)] + ["ecency.com"])
        api, logs = FakeApi(full), Logs()
        added = td.reconcile(["a-new.example.org", "b-new.example.org"], CONFIG, api, logs)
        self.assertEqual(added, ["a-new.example.org"])
        [put] = api.puts()
        self.assertEqual(len(put[3]["domains"]), 10)
        self.assertTrue(any(line.startswith("TURNSTILE FAILED") and mentions(line, "b-new.example.org") and "10" in line for line in logs))

    def test_a_full_widget_is_not_written(self):
        full = dict(WIDGET, domains=[f"t{i}.example.org" for i in range(9)] + ["ecency.com"])
        api, logs = FakeApi(full), Logs()
        self.assertEqual(td.reconcile(["new.example.org"], CONFIG, api, logs), [])
        self.assertEqual(api.puts(), [])
        self.assertTrue(any(line.startswith("TURNSTILE FAILED") and mentions(line, "new.example.org") for line in logs))

    def test_a_full_widget_names_every_wanted_domain_it_leaves_uncovered(self):
        # example.net would cover a.example.net, so only the apex asks for a
        # slot; with no room both tenants stay uncovered and both are named.
        full = dict(WIDGET, domains=[f"t{i}.example.org" for i in range(9)] + ["ecency.com"])
        api, logs = FakeApi(full), Logs()
        self.assertEqual(td.reconcile(["a.example.net", "example.net"], CONFIG, api, logs), [])
        [line] = [line for line in logs if line.startswith("TURNSTILE FAILED")]
        self.assertTrue(mentions(line, "example.net"))
        self.assertTrue(mentions(line, "a.example.net"))

    def test_adds_the_domain_that_covers_the_other_when_one_slot_is_left(self):
        full = dict(WIDGET, domains=[f"t{i}.example.org" for i in range(8)] + ["ecency.com"])
        api, logs = FakeApi(full), Logs()
        added = td.reconcile(["a.example.net", "example.net"], CONFIG, api, logs)
        self.assertEqual(added, ["example.net"])
        self.assertFalse(any(line.startswith("TURNSTILE FAILED") for line in logs))

    def test_a_failed_read_back_says_it_could_not_check_not_that_everything_is_lost(self):
        api, logs = FakeApi(WIDGET), Logs()
        real = api.__call__
        calls = {"get": 0}

        def flaky(method, url, token, body=None):
            if method == "GET":
                calls["get"] += 1
                if calls["get"] == 2:
                    return {"success": False, "errors": [{"code": 10000, "message": "busy"}]}
            return real(method, url, token, body)

        td.reconcile(["blog.example.org"], CONFIG, flaky, logs)
        self.assertTrue(any("could not be checked" in line for line in logs))
        self.assertFalse(any("lacks" in line for line in logs))

    def test_a_read_back_that_raises_still_reports_the_write(self):
        api, logs = FakeApi(WIDGET), Logs()
        real = api.__call__
        calls = {"get": 0}

        def flaky(method, url, token, body=None):
            if method == "GET":
                calls["get"] += 1
                if calls["get"] == 2:
                    raise OSError("timed out")
            return real(method, url, token, body)

        self.assertEqual(td.reconcile(["blog.example.org"], CONFIG, flaky, logs), ["blog.example.org"])
        self.assertTrue(any("could not be checked" in line for line in logs))

    def test_an_api_exception_is_logged_not_raised(self):
        def broken(*args, **kwargs):
            raise OSError("connection refused")

        logs = Logs()
        self.assertEqual(td.reconcile(["blog.example.org"], CONFIG, broken, logs), [])
        self.assertTrue(any(line.startswith("TURNSTILE FAILED") and "connection refused" in line for line in logs))


class LoadConfigTest(unittest.TestCase):
    def test_reads_the_env_file_next_to_the_script(self):
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "turnstile.env"), "w") as f:
                f.write("# comment\nTURNSTILE_ACCOUNT_ID=acc\nTURNSTILE_SITEKEY=0x4AAA\nTURNSTILE_API_TOKEN='tok'\n")
            self.assertEqual(td.load_config(d, {}), CONFIG)

    def test_environment_wins_over_the_file(self):
        with tempfile.TemporaryDirectory() as d:
            env = {"TURNSTILE_ACCOUNT_ID": "acc", "TURNSTILE_SITEKEY": "0x4AAA", "TURNSTILE_API_TOKEN": "tok"}
            self.assertEqual(td.load_config(d, env), CONFIG)

    def test_accepts_export_lines(self):
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "turnstile.env"), "w") as f:
                f.write("export TURNSTILE_ACCOUNT_ID=acc\nexport TURNSTILE_SITEKEY=0x4AAA\nexport TURNSTILE_API_TOKEN=tok\n")
            self.assertEqual(td.load_config(d, {}), CONFIG)

    def test_an_unreadable_file_disables_the_step_instead_of_raising(self):
        with tempfile.TemporaryDirectory() as d:
            os.mkdir(os.path.join(d, "turnstile.env"))  # reading a directory raises IsADirectoryError
            self.assertIsNone(td.load_config(d, {}))
            with open(os.path.join(d, "x"), "wb"):
                pass
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "turnstile.env"), "wb") as f:
                f.write(b"\xff\xfe\x00bad")
            self.assertIsNone(td.load_config(d, {}))

    def test_missing_or_partial_config_disables_the_step(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertIsNone(td.load_config(d, {}))
            self.assertIsNone(td.load_config(d, {"TURNSTILE_ACCOUNT_ID": "acc"}))


class SyncWiringTest(unittest.TestCase):
    """sync-custom-domains.py hands only verified custom domains to the widget step."""

    def setUp(self):
        import importlib.util

        os.environ.setdefault("HOSTING_ORIGIN_IPS", "192.0.2.1")
        here = os.path.dirname(os.path.abspath(__file__))
        spec = importlib.util.spec_from_file_location("sync_custom_domains", os.path.join(here, "sync-custom-domains.py"))
        self.sync = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.sync)
        self.logs = Logs()
        self.sync.log = self.logs

    def test_skips_loudly_without_credentials_but_only_once(self):
        # Every 5 minutes: the same SKIPPED line 288 times a day would bury the
        # log. It is written when the outcome changes.
        self.sync.turnstile_domains.load_config = lambda base, env: None
        state = {}
        self.sync.sync_turnstile(["blog.example.org"], state)
        self.sync.sync_turnstile(["blog.example.org"], state)
        self.assertEqual(sum(line.startswith("TURNSTILE SKIPPED") for line in self.logs), 1)

    def test_a_repeated_failure_is_logged_once_and_a_new_one_again(self):
        self.sync.turnstile_domains.load_config = lambda base, env: CONFIG
        outcomes = iter(["TURNSTILE FAILED: a", "TURNSTILE FAILED: a", "TURNSTILE FAILED: b"])
        self.sync.turnstile_domains.reconcile = lambda wanted, config, http, log, dry_run=False: log(next(outcomes))
        state = {}
        for _ in range(3):
            self.sync.sync_turnstile(["blog.example.org"], state)
        self.assertEqual([l for l in self.logs if l.startswith("TURNSTILE")], ["TURNSTILE FAILED: a", "TURNSTILE FAILED: b"])

    def test_a_dry_run_does_not_record_the_outcome(self):
        # A manual --dry-run must not make the next real run stay silent.
        self.sync.turnstile_domains.load_config = lambda base, env: None
        self.sync.DRY_RUN = True
        state = {}
        self.sync.sync_turnstile(["blog.example.org"], state)
        self.assertNotIn("turnstile_last_outcome", state)

    def test_a_missing_module_does_not_stop_the_vhost_sync(self):
        # The README copies these files by hand: a half-copied origin must keep
        # serving certificates and vhosts.
        self.sync.turnstile_domains = None
        self.sync.sync_turnstile(["blog.example.org"], {})
        self.assertTrue(any(line.startswith("TURNSTILE FAILED") for line in self.logs))

    def test_passes_the_custom_domains_on(self):
        seen = []
        self.sync.turnstile_domains.load_config = lambda base, env: CONFIG
        self.sync.turnstile_domains.reconcile = lambda wanted, config, http, log, dry_run=False: seen.append(list(wanted))
        self.sync.sync_turnstile(["blog.example.org"], {})
        self.assertEqual(seen, [["blog.example.org"]])

    def test_does_nothing_without_custom_domains(self):
        self.sync.turnstile_domains.load_config = lambda base, env: self.fail("should not read config")
        self.sync.sync_turnstile([], {})
        self.assertEqual(self.logs, [])

    def tearDown(self):
        import importlib

        importlib.reload(td)


if __name__ == "__main__":
    unittest.main()
