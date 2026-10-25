# B01 UAT Readiness — Operator Runbook

**Purpose:** Give the operator a single ordered procedure for closing existing readiness blockers with real evidence. This runbook does not authorize UAT or imply any control is closed.

## Step 0 — Establish authority

- Locate the controlled B01 session authorization record.
- Verify explicit business-owner approval, scope (Chapters 463–470 / 48 requirements), target host, execution window and approver timestamp.
- If the record is missing or incomplete, stop. Keep B01-READY-01 open; do not start business tests.

## Step 1 — Verify the target and build

- Use only the approved target HTTPS host recorded in the session authorization.
- Run the existing target preflight for allowlist, HTTPS health and build identity.
- Capture timestamped raw results, returned buildId and deployed commit SHA.
- Reconcile the returned identity to the approved commit. If host is unknown, DNS/network check fails, or identities disagree, record BLOCKED and escalate to the environment/release owner; do not substitute a local/simulated endpoint.

## Step 2 — Verify data and identity prerequisites

- Record approved synthetic dataset ID/version, owner approval and reset/reuse instructions.
- Verify the dedicated OAuth test identity against the target. Store a session reference and redacted result only; never store tokens/secrets.
- Record named tester, business owner, least-privilege role, role-to-account mapping, tenant and scope.
- Verify target audit-event retrieval and governed-report retrieval with the approved identity; archive timestamps, query scope and result references.

## Step 3 — Verify six-family target capability

- Run the existing six-family synthetic smoke suite against the same approved target build.
- Record each family outcome and tie it to the same buildId/commit.
- Document whether state is durable, in-memory, resettable or otherwise limited. If required business workflows depend on persistence and the target cannot provide it, keep B01-READY-07 blocked.

## Step 4 — Gate review

Use `B01_READINESS_BLOCKER_TO_EVIDENCE_MAP.csv` and `B01_READINESS_EVIDENCE_CAPTURE_CHECKLIST.csv` as the control checklist. A control may be closed only when its required artifact exists, is timestamped, identifies the target/build where applicable, and has been reviewed by the responsible owner. Record artifact references and reviewer; do not mark complete from a verbal status or CI-only pass.

**Start rule:** Business UAT may begin only after all seven controls have evidence and the authorized approver records the gate decision. If any control is missing, stale, mismatched or unapproved, the result is BLOCKED — DO NOT EXECUTE.

## Step 5 — Execute existing B01 packs

- Reuse the existing 48-case execution pack and W1–W6 capture templates; do not generate replacement test cases.
- Record actual observed business outcome and evidence reference for each requirement. Keep PASS/FAIL/BLOCKED distinct.
- Link audit records, before/after state, reports, defects and retests as applicable.
- Never copy CI or technical pilot PASS into the business outcome field.

## Step 6 — Review and reconcile

- Review all 48 rows for traceability, complete evidence, failures and retests.
- Obtain separate authorized business acceptance for applicable requirements.
- Reconcile accepted B01 rows into the master 228-requirement register.
- G9 freeze and G10 certification remain separate later decisions and must not be inferred from entry-gate clearance or test execution alone.

## Current known posture

Based on the existing Library readiness register, B01-READY-01 is planning input without formal approval and B01-READY-02 through B01-READY-07 are blocked. Therefore the current disposition remains **BLOCKED — DO NOT EXECUTE** until new evidence is actually captured and reviewed. No AWS resources are authorized by this runbook.