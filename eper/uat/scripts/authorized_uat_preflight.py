#!/usr/bin/env python3
"""Allowlisted EPER UAT target preflight. Does not execute business UAT."""
import json, os, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import datetime, timezone
RESULT_PATH = "uat-target-health-result.json"
MAX_RESPONSE_BYTES = 1024 * 1024
TIMEOUT_SECONDS = 15
def finish(result, code):
    with open(RESULT_PATH, "w", encoding="utf-8") as handle:
        json.dump(result, handle, indent=2, sort_keys=True); handle.write("\n")
    print(json.dumps(result, indent=2, sort_keys=True))
    return code
def run_preflight(env=None):
    env = os.environ if env is None else env
    result = {"schemaVersion":1,"check":"eper-authorized-uat-target-preflight","timestampUtc":datetime.now(timezone.utc).isoformat(),"status":"FAIL","checks":{}}
    base, allow = env.get("UAT_BASE_URL","").strip(), env.get("UAT_ALLOWED_HOST","").strip()
    health_path = env.get("UAT_HEALTH_PATH","").strip()
    expected, field = env.get("UAT_EXPECTED_BUILD_ID",""), env.get("UAT_BUILD_ID_JSON_FIELD","").strip()
    if not allow:
        result["checks"]["allowlist"]={"status":"FAIL","reason":"UAT_ALLOWED_HOST environment variable is missing"}
        return finish(result,1)
    try:
        parsed=urllib.parse.urlsplit(base)
        valid_base=(parsed.scheme=="https" and bool(parsed.hostname) and not parsed.username and not parsed.password and not parsed.query and not parsed.fragment and parsed.path in ("","/") and parsed.netloc.lower()==allow.lower())
    except (ValueError,AttributeError):
        valid_base,parsed=False,None
    if not valid_base:
        result["checks"]["targetValidation"]={"status":"FAIL","reason":"Base URL must be HTTPS and exactly match UAT_ALLOWED_HOST; credentials, paths, queries and fragments are prohibited."}
        return finish(result,1)
    result["targetHost"]=parsed.netloc
    result["checks"]["targetValidation"]={"status":"PASS","reason":"HTTPS host exactly matches the configured allowlist"}
    try:
        hp=urllib.parse.urlsplit(health_path)
        valid_path=(health_path.startswith("/") and not health_path.startswith("//") and bool(hp.path) and not hp.scheme and not hp.netloc and not hp.query and not hp.fragment and "\\\\" not in health_path)
    except (ValueError,AttributeError): valid_path=False
    if not valid_path:
        result["checks"]["healthPathValidation"]={"status":"FAIL","reason":"Health path must be an absolute path only, with no scheme, host, query, fragment or backslash"}
        return finish(result,1)
    result["checks"]["healthPathValidation"]={"status":"PASS"}
    if not expected or not field:
        result["checks"]["buildInputValidation"]={"status":"FAIL","reason":"Expected build identifier and JSON field are required"}
        return finish(result,1)
    result["checks"]["buildInputValidation"]={"status":"PASS"}
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,req,fp,code,msg,headers,newurl): return None
    url=urllib.parse.urlunsplit(("https",parsed.netloc,hp.path,"",""))
    request=urllib.request.Request(url,headers={"Accept":"application/json","User-Agent":"EPER-UAT-Preflight/1.0"},method="GET")
    started=time.monotonic()
    try:
        opener=urllib.request.build_opener(NoRedirect)
        with opener.open(request,timeout=TIMEOUT_SECONDS) as response:
            status_code,content_type=response.status,response.headers.get("Content-Type","")
            body=response.read(MAX_RESPONSE_BYTES+1)
        result["httpStatus"]=status_code; result["responseContentType"]=content_type.split(";")[0].strip()
        result["elapsedMs"]=int((time.monotonic()-started)*1000)
        if status_code<200 or status_code>=300:
            result["checks"]["healthResponse"]={"status":"FAIL","reason":"Health endpoint did not return 2xx"}; return finish(result,1)
        if len(body)>MAX_RESPONSE_BYTES:
            result["checks"]["healthResponse"]={"status":"FAIL","reason":"Health response exceeded the 1 MiB safety limit"}; return finish(result,1)
        payload=json.loads(body.decode("utf-8"))
        if not isinstance(payload,dict):
            result["checks"]["healthResponse"]={"status":"FAIL","reason":"Health response JSON root must be an object"}; return finish(result,1)
        result["checks"]["healthResponse"]={"status":"PASS"}
        actual=payload.get(field); result["buildIdField"],result["expectedBuildId"]=field,expected
        result["actualBuildId"]=actual if isinstance(actual,str) else None
        if not isinstance(actual,str) or actual!=expected:
            result["checks"]["buildIdentity"]={"status":"FAIL","reason":"Health response build identifier did not exactly match expected value"}; return finish(result,1)
        result["checks"]["buildIdentity"]={"status":"PASS"}; result["status"]="PASS"
        result["evidenceBoundary"]="Reachability and build identity only; not OAuth, roles, tenant scope, functional UAT, acceptance, release authorization, or certification."
        return finish(result,0)
    except urllib.error.HTTPError as exc:
        result["httpStatus"]=exc.code
        result["checks"]["healthResponse"]={"status":"FAIL","reason":"Health endpoint returned an HTTP error or redirect; redirects are not followed"}
        return finish(result,1)
    except Exception as exc:
        result["checks"]["healthResponse"]={"status":"FAIL","reason":type(exc).__name__+": request failed or response was not valid JSON"}
        return finish(result,1)
if __name__=="__main__": sys.exit(run_preflight())
