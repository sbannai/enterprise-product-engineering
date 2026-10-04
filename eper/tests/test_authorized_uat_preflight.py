"""Behavior-level tests for the allowlisted UAT target preflight; no network calls are made."""
import importlib.util
import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import Mock, patch
from urllib.error import HTTPError

SCRIPT = Path(__file__).resolve().parents[1] / "uat" / "scripts" / "authorized_uat_preflight.py"
SPEC = importlib.util.spec_from_file_location("authorized_uat_preflight", SCRIPT)
preflight = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(preflight)


class FakeResponse:
    def __init__(self, body, status=200, content_type="application/json"):
        self.body = body
        self.status = status
        self.headers = {"Content-Type": content_type}

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self, size=-1):
        return self.body[:size]


class AuthorizedUatPreflightTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.old_cwd = os.getcwd()
        os.chdir(self.temp.name)
        self.env = {
            "UAT_ALLOWED_HOST": "uat.example.test",
            "UAT_BASE_URL": "https://uat.example.test",
            "UAT_HEALTH_PATH": "/health",
            "UAT_EXPECTED_BUILD_ID": "abc123",
            "UAT_BUILD_ID_JSON_FIELD": "buildId",
        }

    def tearDown(self):
        os.chdir(self.old_cwd)
        self.temp.cleanup()

    def call(self, env=None):
        with redirect_stdout(io.StringIO()):
            code = preflight.run_preflight(self.env if env is None else env)
        result = json.loads(Path(preflight.RESULT_PATH).read_text(encoding="utf-8"))
        return code, result

    def test_missing_allowlist_fails_before_network(self):
        env = {**self.env, "UAT_ALLOWED_HOST": ""}
        with patch("urllib.request.build_opener") as opener:
            code, result = self.call(env)
        self.assertEqual(code, 1)
        self.assertEqual(result["checks"]["allowlist"]["status"], "FAIL")
        opener.assert_not_called()

    def test_non_allowlisted_host_and_base_path_fail_closed(self):
        for base in ("https://other.example.test", "https://uat.example.test/extra"):
            with self.subTest(base=base), patch("urllib.request.build_opener") as opener:
                code, result = self.call({**self.env, "UAT_BASE_URL": base})
                self.assertEqual(code, 1)
                self.assertEqual(result["checks"]["targetValidation"]["status"], "FAIL")
                opener.assert_not_called()

    def test_unsafe_health_path_fails_before_network(self):
        for path in ("//other.example.test/health", "https://other.example.test/health", "/health?token=x", "/health\\admin"):
            with self.subTest(path=path), patch("urllib.request.build_opener") as opener:
                code, result = self.call({**self.env, "UAT_HEALTH_PATH": path})
                self.assertEqual(code, 1)
                self.assertEqual(result["checks"]["healthPathValidation"]["status"], "FAIL")
                opener.assert_not_called()

    def test_exact_build_match_passes_and_records_evidence_boundary(self):
        fake = FakeResponse(b'{"buildId":"abc123","ok":true}')
        opener = Mock()
        opener.open.return_value = fake
        with patch("urllib.request.build_opener", return_value=opener):
            code, result = self.call()
        self.assertEqual(code, 0)
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["checks"]["buildIdentity"]["status"], "PASS")
        self.assertIn("not OAuth", result["evidenceBoundary"])
        self.assertNotIn("responseBody", result)

    def test_build_mismatch_and_non_string_build_fail(self):
        for body in (b'{"buildId":"wrong"}', b'{"buildId":123}'):
            with self.subTest(body=body):
                opener = Mock()
                opener.open.return_value = FakeResponse(body)
                with patch("urllib.request.build_opener", return_value=opener):
                    code, result = self.call()
                self.assertEqual(code, 1)
                self.assertEqual(result["checks"]["buildIdentity"]["status"], "FAIL")

    def test_redirect_is_not_followed_and_fails(self):
        opener = Mock()
        opener.open.side_effect = HTTPError("https://uat.example.test/health", 302, "redirect", {}, None)
        with patch("urllib.request.build_opener", return_value=opener):
            code, result = self.call()
        self.assertEqual(code, 1)
        self.assertIn("redirect", result["checks"]["healthResponse"]["reason"])

    def test_non_object_or_invalid_json_fails(self):
        for body in (b'not-json', b'["not","object"]'):
            with self.subTest(body=body):
                opener = Mock()
                opener.open.return_value = FakeResponse(body)
                with patch("urllib.request.build_opener", return_value=opener):
                    code, result = self.call()
                self.assertEqual(code, 1)
                self.assertEqual(result["status"], "FAIL")

    def test_oversized_response_fails(self):
        opener = Mock()
        opener.open.return_value = FakeResponse(b"x" * (preflight.MAX_RESPONSE_BYTES + 1))
        with patch("urllib.request.build_opener", return_value=opener):
            code, result = self.call()
        self.assertEqual(code, 1)
        self.assertIn("1 MiB", result["checks"]["healthResponse"]["reason"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
