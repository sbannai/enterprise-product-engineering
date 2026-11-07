# Main-Branch-Only Functional Delivery Policy

**Effective:** 2026-11-07  
**Repository:** `sbannai/enterprise-product-engineering`  
**Functional source of truth:** `main`

## Decision

EPER functionality is delivered and operated from `main` only. An open, draft, stacked, stale, blocked, or unmerged pull request must never be treated as the sole place where an approved capability exists or as a reason to withhold that capability from the mainline product.

## Operating rules

1. **Main is the product baseline.** Local development, integration validation, release candidates, demos and functional acceptance must resolve to an identified `main` SHA. Reports must state that SHA.
2. **No PR hostage dependencies.** PRs are review/integration artifacts, not runtime dependencies. Do not require a chain of open PRs to be merged before the product can receive an independently deliverable capability.
3. **Integrate coherent slices.** Extract or reimplement the required change as a complete, reviewable slice on top of current `main`. Preserve the intended behavior and tests; do not blindly cherry-pick stacked commits or merge stale branches.
4. **Keep main continuously usable.** Every mainline change must pass the applicable typecheck, unit/integration tests, PostgreSQL migration/replay checks, tenant-isolation/RLS checks, security checks and relevant end-to-end regression checks before it is treated as delivered.
5. **No partial capability claims.** API, UI, persistence, authorization, audit and operational behavior must be described separately. A backend contract or green PR workflow is not a completed customer journey.
6. **Database safety.** PostgreSQL remains the approved target. Migrations must be additive/replay-safe and tested against clean install, upgrade and repeat execution. No production database switch or destructive migration is implied.
7. **Security and tenant boundaries are non-negotiable.** Preserve server-derived tenant/actor identity, least privilege, RLS, auditability, secret boundaries, session binding and fail-closed behavior.
8. **PR hygiene.** Keep PRs small and short-lived where they are useful. Close superseded PRs only after their required changes are present and verified on `main`; record the replacement main SHA and evidence. Do not delete branches until ownership and retained-evidence checks are complete.
9. **No false closure.** A successful workflow on a PR head does not prove the same code is on `main`. A merge/commit SHA, mainline test evidence and functional acceptance are required to report a capability as delivered.
10. **Release/UAT governance remains separate.** This policy does not authorize Business UAT, production deployment, external provider dispatch, or chargeable cloud provisioning. Existing owner-approved gates remain in force.

## Delivery workflow

For each capability:

1. Identify the user-visible outcome and acceptance criteria.
2. Inspect current `main` and identify the smallest complete implementation slice.
3. Implement the slice against current `main`; do not make its availability depend on unrelated PRs.
4. Run exact-main-SHA validation, including affected API/UI/database/security and regression tests.
5. Integrate only when checks pass and required review/owner decisions are present.
6. Verify the resulting commit is on `main`; update the functionality register with the main SHA, test evidence, remaining gaps and owner disposition.
7. Close or mark superseded PRs/issues only when their scope is demonstrably delivered or explicitly withdrawn.

## Reporting format

Every status report must distinguish:

- **On main:** verified functionality and exact main SHA.
- **Not on main:** work that exists only in branches or PRs.
- **Partially delivered:** which layer is present and which layer is missing.
- **Blocked by decision:** explicit owner decision required, not a technical PR dependency.
- **Verified:** test name, exact commit SHA, result and known skips.
- **Not authorized:** UAT, production, external integrations or cloud activity that remains gated.

The 228 approved requirements and 38 chapters remain the controlled baseline unless the designated owner explicitly approves a change.