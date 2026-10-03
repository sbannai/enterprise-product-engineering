import contextlib, io, json, os, tempfile, unittest, urllib.error
from unittest import mock
from uat.scripts import authorized_uat_preflight as preflight
BASE_ENV={"UAT_ALLOWED_HOST":"uat.example.test","UAT_BASE_URL":"https://uat.example.test","UAT_HEALTH_PATH":"/health","UAT_EXPECTED_BUILD_ID":"abc123","UAT_BUILD_ID_JSON_FIELD":"buildId"}
class FakeResponse:
    def __init__(self,body,status=200,content_type="application/json"): self.status,self.headers,self.body=status,{"Content-Type":content_type},body
    def __enter__(self): return self
    def __exit__(self,*args): return False
    def read(self,size=-1): return self.body[:size]
class FakeOpener:
    def __init__(self,response=None,error=None): self.response,self.error,self.calls=response,error,[]
    def open(self,request,timeout):
        self.calls.append((request,timeout))
        if self.error: raise self.error
        return self.response
class AuthorizedUatPreflightTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(); self.cwd=os.getcwd(); os.chdir(self.temp.name)
        self.redirect=contextlib.redirect_stdout(io.StringIO()); self.redirect.__enter__()
    def tearDown(self):
        self.redirect.__exit__(None,None,None); os.chdir(self.cwd); self.temp.cleanup()
    def run_check(self,env=None,opener=None):
        with mock.patch.object(preflight.urllib.request,"build_opener",return_value=opener) as build:
            code=preflight.run_preflight(dict(BASE_ENV if env is None else env))
        with open(preflight.RESULT_PATH,encoding="utf-8") as f: result=json.load(f)
        return code,result,build
    def test_success_requires_exact_build_identity(self):
        opener=FakeOpener(FakeResponse(b'{"buildId":"abc123"}')); code,result,_=self.run_check(opener=opener)
        self.assertEqual(code,0); self.assertEqual(result["status"],"PASS"); self.assertEqual(result["checks"]["buildIdentity"]["status"],"PASS")
        self.assertEqual(opener.calls[0][1],preflight.TIMEOUT_SECONDS); self.assertEqual(opener.calls[0][0].full_url,"https://uat.example.test/health")
    def test_rejects_host_not_on_allowlist_without_network_call(self):
        code,result,build=self.run_check(dict(BASE_ENV,UAT_BASE_URL="https://attacker.example.test"),FakeOpener())
        self.assertEqual(code,1); self.assertEqual(result["checks"]["targetValidation"]["status"],"FAIL"); build.assert_not_called()
    def test_rejects_base_url_with_path(self):
        code,result,build=self.run_check(dict(BASE_ENV,UAT_BASE_URL="https://uat.example.test/unapproved"),FakeOpener())
        self.assertEqual(code,1); self.assertEqual(result["checks"]["targetValidation"]["status"],"FAIL"); build.assert_not_called()
    def test_rejects_external_health_path(self):
        code,result,build=self.run_check(dict(BASE_ENV,UAT_HEALTH_PATH="//attacker.example.test/health"),FakeOpener())
        self.assertEqual(code,1); self.assertEqual(result["checks"]["healthPathValidation"]["status"],"FAIL"); build.assert_not_called()
    def test_build_mismatch_fails(self):
        code,result,_=self.run_check(opener=FakeOpener(FakeResponse(b'{"buildId":"different"}')))
        self.assertEqual(code,1); self.assertEqual(result["checks"]["buildIdentity"]["status"],"FAIL")
    def test_redirect_is_not_followed(self):
        err=urllib.error.HTTPError("https://uat.example.test/health",302,"Found",{},None)
        code,result,_=self.run_check(opener=FakeOpener(error=err))
        self.assertEqual(code,1); self.assertEqual(result["httpStatus"],302); self.assertIn("redirect",result["checks"]["healthResponse"]["reason"])
    def test_invalid_json_fails_without_echoing_payload(self):
        code,result,_=self.run_check(opener=FakeOpener(FakeResponse(b"private payload")))
        self.assertEqual(code,1); self.assertEqual(result["status"],"FAIL"); self.assertNotIn("private payload",json.dumps(result))
    def test_missing_allowlist_fails_before_network(self):
        code,result,build=self.run_check(dict(BASE_ENV,UAT_ALLOWED_HOST=""),FakeOpener())
        self.assertEqual(code,1); self.assertEqual(result["checks"]["allowlist"]["status"],"FAIL"); build.assert_not_called()
if __name__=="__main__": unittest.main()
