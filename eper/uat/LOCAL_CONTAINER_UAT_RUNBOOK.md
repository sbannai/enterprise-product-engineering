# EPER Local Container UAT Runbook (No AWS Resources)

## Purpose and evidence boundary

This runbook validates that a specific, CI-built EPER container artifact can be downloaded, checksum-verified, loaded, and run locally without provisioning AWS or creating chargeable infrastructure.

A successful run is **local runtime evidence only**. It is not business UAT, an approved reachable HTTPS target, requirement acceptance, production evidence, release authorization, G9 traceability freeze, or G10 certification. Do not mark any of the 228 requirements accepted from this smoke test.

## Controlled build to test

- Repository: `sbannai/enterprise-product-engineering`
- Select the latest successful **EPER Container Runtime Smoke Test** run for the commit you intend to validate; do not assume an older artifact is current.
- Choose a successful runtime-smoke artifact for the exact full commit SHA you intend to test. The artifact name must be `eper-runtime-image-<full-commit-sha>`.
- Open the [runtime smoke workflow runs](https://github.com/sbannai/enterprise-product-engineering/actions/workflows/eper-container-runtime-smoke.yml) and select the successful run for that commit.
- Artifact name follows `eper-runtime-image-<full-commit-sha>`.
- Artifact retention is seven days from upload; if it expires, rerun the workflow on the desired commit.

Download the artifact ZIP from the run's **Artifacts** section in GitHub Actions. Extract it to a local working directory. The ZIP should contain the compressed Docker image, `SHA256SUMS`, and `BUILD-METADATA.txt`.

## Verify and run

Use a machine with Docker Engine and `curl` installed. Run from the extracted artifact directory.

```bash
set -euo pipefail
cat BUILD-METADATA.txt
sha256sum --check SHA256SUMS
IMAGE_TAR="$(find . -maxdepth 1 -type f -name 'eper-runtime-*.tar.gz' -print -quit)"
test -n "$IMAGE_TAR"
# Set this to the exact artifact name selected in GitHub Actions.
ARTIFACT_NAME="${ARTIFACT_NAME:?Set ARTIFACT_NAME to eper-runtime-image-<full-commit-sha>}"
EXPECTED_BUILD_ID="${ARTIFACT_NAME#eper-runtime-image-}"
test "$EXPECTED_BUILD_ID" != "$ARTIFACT_NAME"
test "${#EXPECTED_BUILD_ID}" -eq 40
case "$EXPECTED_BUILD_ID" in *[!0-9a-f]*) echo "Invalid SHA in ARTIFACT_NAME" >&2; exit 1;; esac
BUILD_ID="$(sed -n 's/^buildId=//p' BUILD-METADATA.txt)"
test -n "$BUILD_ID"
test "$BUILD_ID" = "$EXPECTED_BUILD_ID"
gzip -dc "$IMAGE_TAR" | docker load
IMAGE_TAG="eper-runtime-smoke:$BUILD_ID"
docker image inspect "$IMAGE_TAG" >/dev/null
docker run --detach --rm --name eper-local-uat-smoke \
  --publish 127.0.0.1:18080:8080 \
  --env "EPER_BUILD_ID=$BUILD_ID" "$IMAGE_TAG"
cleanup() { docker stop eper-local-uat-smoke >/dev/null 2>&1 || true; }
trap cleanup EXIT
ready=0
for attempt in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:18080/health --output /tmp/eper-health.json; then
    ready=1
    break
  fi
  sleep 1
done
test "$ready" -eq 1
python3 - "$BUILD_ID" <<'PY'
import json, sys
expected = {"status": "ok", "service": "eper-api", "buildId": sys.argv[1]}
with open("/tmp/eper-health.json", encoding="utf-8") as f:
    actual = json.load(f)
assert actual == expected, f"expected {expected!r}, got {actual!r}"
print(json.dumps({"result": "PASS", "health": actual}, indent=2))
PY
STATUS="$(curl --silent --output /dev/null --write-out '%{http_code}' http://127.0.0.1:18080/not-a-real-route)"
test "$STATUS" = "404"
echo "PASS: checksum, image load, health/build identity, and unknown-route 404"
```

If the local image tag differs, inspect `docker image ls` after `docker load` and use the exact tag shown; do not rebuild and then claim the result validates the downloaded artifact.

## Record the evidence

Record the operator, date/time with timezone, host OS, Docker version, artifact name, build ID, SHA-256 verification output, health response, unknown-route status, and any failure logs. Do not include credentials, tokens, or private environment values.

Suggested evidence filename: `EPER-LOCAL-RUNTIME-SMOKE-<buildId>-<YYYYMMDD>.md`.

## What this does not unblock

A real authorized HTTPS preflight still requires the owner-approved HTTPS base URL, exact allowed hostname, expected deployed build ID, and configured protected GitHub Environment. Business UAT additionally requires approved test data, verified identity/session, named tester and role mapping, and audit/report access evidence. No AWS resource is created by this runbook.

## Exercise all six capability families from Windows PowerShell

The health-only container command above intentionally does not enable the capability execution API. To run the six-family runner, start the same verified image with the opt-in API enabled. Keep the port bound to loopback; do not expose this local test API to a network.

In PowerShell, set $BuildId to the exact 40-character build ID verified above. Run these commands from the extracted artifact directory:

    $BuildId = "<exact-40-character-build-id>"
    $ImageTag = "eper-runtime-smoke:$BuildId"
    $env:EPER_LOCAL_CAPABILITY_TOKEN = [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
    $env:EPER_LOCAL_TENANT_ID = "uat-test-tenant"
    $env:EPER_LOCAL_PRINCIPAL_ID = "uat-test-operator"
    docker rm --force eper-local-uat-smoke 2>$null
    docker run --detach --rm --name eper-local-uat-smoke --publish 127.0.0.1:18080:8080 --env "EPER_BUILD_ID=$BuildId" --env "EPER_LOCAL_CAPABILITY_API=true" --env "EPER_LOCAL_CAPABILITY_TOKEN=$env:EPER_LOCAL_CAPABILITY_TOKEN" --env "EPER_LOCAL_TENANT_ID=$env:EPER_LOCAL_TENANT_ID" --env "EPER_LOCAL_PRINCIPAL_ID=$env:EPER_LOCAL_PRINCIPAL_ID" $ImageTag
    Invoke-RestMethod http://127.0.0.1:18080/health
    .\run-six-family-local-uat.ps1 -Token $env:EPER_LOCAL_CAPABILITY_TOKEN -EvidencePath ".\EPER-SIX-FAMILY-HTTP-SMOKE.json"

Run the script from the directory where run-six-family-local-uat.ps1 is present (for example, copy it from the repository's eper/uat directory into the extracted artifact directory). Review all six rows in the JSON evidence file. On completion, stop the container and clear the shell token:

    docker stop eper-local-uat-smoke
    Remove-Item Env:EPER_LOCAL_CAPABILITY_TOKEN

Expected: six PASS results and a build ID matching the verified image. A passing result is local technical smoke evidence only; it does not constitute business UAT or acceptance of any requirement.
