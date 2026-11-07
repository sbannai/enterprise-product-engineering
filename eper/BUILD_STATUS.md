# Build Status

**Source of truth:** GitHub `main`  
**EPER scope:** Chapters 463–500 / 228 requirements  
**Main SHA at start of this status refresh:** `72466c20eea91231c17efea3f5b5cf3947df38ef`  
**Status updated:** 2026-11-07

## Delivery and validation status

- The last independently observed successful functional CI baseline is `2c380d79c55c9183a42ed534ffd1a504f7d41316` (2026-11-03 16:36 UTC).
- The governance/status commits after that baseline are documentation-only. They do not constitute product functionality or replace validation.
- The combined-status query for main SHA `72466c20eea91231c17efea3f5b5cf3947df38ef` returned no checks.
- The focused `.github/workflows/ci.yml` workflow is configured for `workflow_dispatch` and pushes to `main` affecting `eper/**`. A status-file push is therefore expected to trigger that lane. The run and its checked-out head SHA must be independently verified before marking the resulting mainline green.
- No workflow run for the current status-refresh commit has yet been confirmed.

## Functional scope and evidence rules

- The controlled baseline remains 228 requirements across Chapters 463–500. Do not alter this baseline without owner approval.
- Report each capability across API, UI, persistence, authorization, audit and operational dimensions; repository presence alone is not completion evidence.
- Main is the sole functional source of truth. PRs are review artifacts and must not hold functionality hostage.
- Implement complete, independently testable slices directly against current main. Do not blindly merge stacked or stale PRs.
- Keep PostgreSQL migrations replay-safe; verify RLS ENABLE/FORCE, tenant/application isolation, least-privilege grants, audit immutability and rollback behavior with real PostgreSQL integration tests where applicable.
- Historical static SQL checks or migration-runner ledger skips are not proof that migration DDL can be executed twice.

## Customer asset work — current mainline boundary

- Issue #427 describes a replay defect in customer-asset migration 021 on a PR foundation. The mainline audit currently lists audit migrations only through 020; migration 021 and its claimed implementation are not yet verified as present on main.
- Issue #425 requires real PostgreSQL 16 execution, upgrade, replay, RLS, checksum and data-preservation tests for the customer-asset upload recovery migration. This remains open.
- Runtime upload reservation recovery, session binding, idempotent retries and provider-outcome recovery remain incomplete until implemented and verified on main.
- Do not mark either issue complete based on PR-only code or static checks.

## Backlog and management

- Last live backlog snapshot: 31 open PRs and 32 open issues (2026-11-07). Refresh before publishing a later count.
- Do not mass-close PRs/issues. Close only after verifying that the scope is delivered on main or has an explicit documented disposition.
- Every status report should identify exact main SHA, commit purpose, test/run evidence, remaining risks, owner decisions and next action.

## Governance and release state

- Business UAT: **NOT AUTHORIZED / NOT EXECUTED**.
- Business acceptance: pending; automated pilot tests do not imply business acceptance.
- G9 traceability freeze: pending explicit evidence and owner disposition.
- Release authorization: pending.
- Production/operations readiness: pending.
- Certification: pending.
- Main branch protection: **NOT VERIFIED** through the connected GitHub integration; administrator confirmation required.
- PostgreSQL is the approved target persistence engine for local development and integration tests only. No cloud database or chargeable AWS resources are authorized.

## Next actions

1. Observe the push-triggered focused CI run and verify its exact head SHA, conclusion, test totals, skips and artifact links.
2. Reconcile the customer-asset migration foundation directly on main; implement replay-safe DDL and PostgreSQL 16 execution tests without weakening RLS or grants.
3. Implement durable upload reservation recovery and verified customer-session binding as a complete mainline feature slice.
4. Update feature and backlog registers only from verified mainline code and test evidence.
5. Keep Business UAT blocked until every entry gate is evidenced and explicitly approved.
