# EPER Local Container UAT Runbook (No AWS Resources)

## Purpose and evidence boundary

This runbook validates that a specific, CI-built EPER container artifact can be downloaded, checksum-verified, loaded, and run locally without provisioning AWS or creating chargeable infrastructure.

A successful run is **local runtime evidence only**. It is not business UAT, an approved reachable HTTPS target, requirement acceptance, production evidence, release authorization, G9 traceability freeze, or G10 certification. Do not mark any of the 228 requirements accepted from this smoke test.

## Controlled build to test

- Repository: `sbannai/enterprise-product-engineering`
- Select the latest successful **EPER Container Runtime Smoke Test** run for the commit you intend to validate; do not assume an older artifact is current.
- Latest verified main build at the time of this update: `8d66aa63c7cd02d359b6d8edda6b54a9530cef14`.
- Latest main runtime smoke run: https://github.com/sbannai/enterprise-product-engineering/actions/runs/37928280657
- Latest main EPER CI run: https://github.com/sbannai/enterprise-product-engineering/actions/runs/37928280679
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
gzip -dc "$IMAGE_TAR" | docker load
BUILD_ID="$(sed -n 's/^buildId=//p' BUILD-METADATA.txt)"
test "$BUILD_ID" = "$(sed -n 's/^buildId=//' BUILD-METADATA.txt)"
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
