# EPER Fresh-Clone Developer Setup

**Supported baseline:** Node.js 20, npm with lockfile support, Docker Engine/Desktop with Docker Compose v2, Git.  
**Database:** PostgreSQL 16, local container only.  
**Cloud spend:** None. This workflow does not provision AWS or any chargeable cloud resource.

## 1. Clone and enter the application

```bash
git clone https://github.com/sbannai/enterprise-product-engineering.git
cd enterprise-product-engineering/eper
```

For a handover, record the exact commit you cloned:

```bash
git rev-parse HEAD
```

## 2. Start local PostgreSQL

From the `eper/` directory:

```bash
docker compose -f docker-compose.local.yml up -d --wait
```

The database is published only on `127.0.0.1:5432`. Defaults are deliberately local-development-only:
- Database: `eper_test_local`
- User: `eper`
- Password: `eper_local_only_password`

Do not reuse these credentials outside a disposable local environment. To change them, set `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` before starting the container, and supply the matching `DATABASE_URL` to the verification command.

## 3. Install the locked dependencies

```bash
npm ci
```

Use `npm ci`, not `npm install`, for a reproducible clean checkout. The committed `package-lock.json` is authoritative.

## 4. Run the full local verification

```bash
npm run dev:verify
```

The command:
1. Refuses non-loopback database hosts and database names that do not identify a local/dev/test/sandbox database.
2. Verifies the selected PostgreSQL database identity.
3. Runs TypeScript typecheck and build.
4. Applies payment, audit, workflow, campaign-scheduler, capability and ticketing migrations in the same order as the CI lanes.
5. Re-runs workflow, ticketing and capability migrations to check repeatability.
6. Runs the full `npm test` suite with live actor/application assignment and capability PostgreSQL integration tests enabled and scheduler PostgreSQL integration pointed at the local database.

Expected final marker: `EPER_LOCAL_DEVELOPER_VERIFICATION=PASS`. A skipped opt-in integration test is not proof of live PostgreSQL behavior; inspect test output and confirm the relevant tests report as passed.

To use a non-default local connection string:

**Bash**
```bash
DATABASE_URL='postgres://eper:your-local-password@127.0.0.1:5432/eper_test_local' npm run dev:verify
```

**PowerShell**
```powershell
$env:DATABASE_URL = 'postgres://eper:your-local-password@127.0.0.1:5432/eper_test_local'
npm run dev:verify
```

## 5. Start the API

After a successful build:

```bash
npm start
```

The base API process is not proof that every optional capability is enabled. Payment, ticketing, workflow, scheduler, agent and customer routes have explicit configuration/readiness gates. Configure only the local feature flags and test identities required for the capability being developed. Do not add real provider credentials or enable outbound messaging/publication during routine local verification.

## 6. Stop and reset local PostgreSQL

Stop while preserving data:

```bash
docker compose -f docker-compose.local.yml down
```

**Destructive reset** — removes the local PostgreSQL volume and all local test data:

```bash
docker compose -f docker-compose.local.yml down -v
```

Never run the destructive reset against a shared database.

## 7. What this setup proves—and what it does not

A successful `dev:verify` run proves the selected checkout typechecks/builds, the local migration sequence executes, repeatability checks pass, and the tests actually enabled in that run pass against the disposable local database. Preserve the commit SHA and full command output with the evidence.

It does not prove production scale, production backup/restore, cloud deployment, external provider delivery, business acceptance or Business UAT. Those require separate evidence and authorization.

## 8. CI equivalence and handover

The canonical CI sequence is in `.github/workflows/ci.yml` and `.github/workflows/eper-integrated-validation.yml`. When changing migrations, keep the local script and CI migration order aligned. A new engineer should be able to clone the repository, start PostgreSQL, run `npm ci`, run `npm run dev:verify`, and reproduce the same tests without relying on a prior chat or private workstation state.

For architecture and product scope, read:
- `docs/ENGINEERING_CONTINUITY_AND_INDEPENDENCE_CHARTER.md`
- `docs/SEVEN_CHECKPOINT_OPERATING_SCORECARD.md`
- `docs/requirements/EPER_PRODUCT_REQUIREMENTS_CHANGE_CONTROL_v1.4.md`
- `docs/requirements/EPER_V34_TO_228_REQUIREMENTS_CROSSWALK.md`
- `docs/requirements/EPER_PRODUCT_REQUIREMENTS_CHANGE_CONTROL_v1.6.0_DRAFT.md`
