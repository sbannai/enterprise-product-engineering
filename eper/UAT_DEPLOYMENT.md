# EPER Controlled UAT Deployment

## Scope boundary

This package provides only the minimal HTTP runtime needed to establish a live UAT target. It does not implement or certify the 228 business requirements, and it does not constitute business acceptance, formal UAT sign-off, production release, or release authorization.

## Build a container image

Run from the repository root:

```sh
docker build \
  --build-arg EPER_BUILD_ID="$(git rev-parse HEAD)" \
  -t eper-uat:rc1 \
  -f eper/Dockerfile eper
```

The build ID must be the exact 40-character commit SHA that is being deployed. Do not label an image with a commit SHA unless it was built from that commit.

## Run a local smoke check

```sh
docker run --rm -d --name eper-uat-smoke -p 8080:8080 eper-uat:rc1
curl --fail-with-body http://127.0.0.1:8080/health
docker stop eper-uat-smoke
```

Expected health response is HTTP 200 with `status: "ok"`, `service: "eper-api"`, and the exact configured commit SHA in `buildId`. If the build ID is missing or invalid, the health endpoint returns HTTP 503.

## Hosting prerequisites

Before an authorized remote preflight can run, the project owner must select and provision a non-production UAT hosting target with:
- HTTPS endpoint and DNS/TLS configured.
- Container image deployed from an approved commit.
- Public or workflow-accessible `GET /health` endpoint.
- GitHub Environment `eper-business-uat` created.
- Environment variable `UAT_ALLOWED_HOST` set to the exact approved hostname.

Do not put credentials in the repository or build arguments. Configure provider secrets through the hosting platform or GitHub Environment secrets as applicable.

## Acceptance boundary

A successful health check verifies reachability and build identity only. Authentication, role permissions, tenant isolation, requirement-level functional execution, business acceptance, and formal UAT sign-off remain separate controls.
