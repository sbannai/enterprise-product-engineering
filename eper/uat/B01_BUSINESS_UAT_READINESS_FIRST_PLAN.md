# B01 Business UAT — Readiness-First Execution Plan

**Document ID:** EPER-B01-BUSINESS-UAT-READINESS-PLAN-001  
**Date:** 2026-10-19  
**Scope:** Option A; 228 requirements / 38 chapters unchanged. First pilot tranche: Chapter 463, six existing cases.  
**Purpose:** Begin meaningful Business UAT preparation now without confusing preparation or exploratory walkthroughs with authorized formal acceptance.

## 1. Decision: prepare Business UAT now; keep formal acceptance gated

Outstanding design/contract approvals should not prevent preparation of test data, actor journeys, business walkthroughs, defect capture, and evidence-capture templates. They do prevent recording formal pass/fail outcomes where the expected business rule is not approved, and they prevent declaring UAT passed.

Run three separate lanes:

1. **Lane A — Readiness preparation (start now):** scenario walkthroughs, environment/build identification, synthetic data planning, tester/role mapping, evidence templates, and defect triage rehearsal. These activities do not mark a canonical case executed.
2. **Lane B — Exploratory business walkthrough (only in a safe, non-production/test environment):** users can inspect screens and try clearly labelled draft journeys to identify usability and missing-functionality gaps. Capture findings as exploratory observations, not acceptance evidence; do not use real transactions, external payment, notifications, or irreversible actions without environment-specific approval.
3. **Lane C — Formal Business UAT (gated):** execute approved case steps against approved expected results only after the D10/session authorization, target/environment, build, test data, actor/tenant, oracle, and evidence plan are recorded. Only then may a canonical case move from NOT_RUN to an actual outcome.

## 2. Chapter 463 readiness run sheet

| Canonical case | Business walkthrough focus | Preparation that can start now | Formal-execution blocker |
|---|---|---|---|
| B01-463-01 / REQ-46301 | Create/read/update record and inspect lifecycle history | Draft a synthetic requisition/record set; list expected business fields and questions | Approved procurement object model, lifecycle states/transitions, schema and persistence expectations |
| B01-463-02 / REQ-46302 | Role/tenant access and approval authority | Prepare actor-role matrix template and positive/negative access journeys | Approved role×action×resource×tenant/delegation/SoD matrix and test identities |
| B01-463-03 / REQ-46303 | Required fields, validation and business-rule feedback | Prepare missing-field, invalid-value and boundary-value test-data candidates | Approved required/conditional fields, thresholds, precedence, error outcomes and rule version |
| B01-463-04 / REQ-46304 | Audit trail, attribution and retrieval | Define evidence capture checklist and sample audit questions | Approved material-event taxonomy, payload, access, integrity and retention requirements |
| B01-463-05 / REQ-46305 | Exception, retry, recovery and escalation | Map failure injection points and record the recovery questions; no live retries yet | Approved exception taxonomy, idempotency/retry/backoff/replay/compensation/escalation policy |
| B01-463-06 / REQ-46306 | Reports, filters, KPI values and reconciliation | Prepare sample reporting questions and synthetic source/expected-value worksheet | Approved KPI definitions/formulas, report access, lineage, freshness and reconciliation tolerance |

All rows above are preparation activities. They do not approve the draft oracle or change the canonical execution capture.

## 3. Minimum readiness packet for each canonical case

Complete one packet per existing case ID, without creating duplicate case IDs:
- Requirement ID, SRS ID and TRC ID verified against the controlled baseline.
- Business owner/tester and test actor/role/tenant identified.
- Approved requirement-specific source and measurable expected result, or explicitly marked BLOCKED — ORACLE NOT APPROVED.
- Test environment, application URL, build/commit SHA and preflight/health result.
- Synthetic test data reference and reset/cleanup method.
- Reviewed positive and negative steps; external side effects disabled or approved.
- Evidence checklist: timestamp, tester, build, steps, expected/actual results, screenshots/log references, defect/exception ID.
- D10/session authorization reference before formal execution.
- Business reviewer, final decision and approval reference after execution.

## 4. Immediate actions and exit checks

**Now, without waiting for design approval**
1. Keep the six canonical Chapter 463 rows and IDs unchanged.
2. Prepare synthetic data and the six case packets using draft markers for any unapproved expected result.
3. Confirm whether a safe non-production application endpoint and build are available. Do not infer hosting from green CI.
4. Run a business walkthrough only if that safe endpoint is actually available and its use is approved; log discoveries as exploratory observations.
5. Triage observations into (a) defect against an approved rule, (b) missing business decision, (c) usability/requirement gap, or (d) environment/test-data issue.
6. Keep candidate-oracle approval, exact HLD→LLD binding, contract approval and D10 authorization as separate gates.

**Before formal UAT**
- Each case has a measurable approved oracle and source binding.
- Test identities/data and environment are approved.
- Technical preflight passes on the identified build.
- D10/session authorization is recorded.
- Evidence capture is ready and business approver is identified.

## 5. Status semantics — no false closure

- READY_FOR_WALKTHROUGH: preparation complete; exploratory walkthrough may occur if environment use is approved.
- BLOCKED_ORACLE: expected business result depends on an unapproved policy/source.
- READY_FOR_FORMAL_UAT: all case-level approvals, environment, data, and D10 authorization are recorded.
- NOT_RUN: no formal case execution has occurred.
- PASS / FAIL / BLOCKED: only after an authorized formal execution with actual evidence and a reviewed result.

## 6. Current baseline and gate status

- Canonical Chapter 463 cases: 6, preserved.
- Requirements baseline: 228; chapters: 38; Option A and IDs unchanged.
- Approved acceptance oracles: 0/6 currently evidenced.
- Exact approved HLD→LLD pairs: 0/6 currently evidenced.
- Full approved DATA/API/EVENT slots or approved N/A: 0/18 currently evidenced.
- Formal Business UAT: not authorized / not executed.
- CI success is technical automation evidence, not business acceptance.
- No production transactions or paid AWS resources are authorized by this plan.

**Disposition:** Start readiness preparation now. Use exploratory walkthroughs only in an approved safe environment. Keep formal Business UAT execution gated until its explicit authorization and acceptance controls are satisfied.


## 7. Target facts reconciled from the existing evidence trail — 2026-10-19

Do not describe the UAT target as simply "missing". The controlled history records the following:

- Candidate target: `https://eper-b01-uat-lj3n.onrender.com`, Render service `eper-b01-uat`, configured on the **free** plan in `render.yaml`, health path `/health`.
- On 2026-10-16, the requester supplied this health response: `{"status":"ok","service":"eper-api","buildId":"8825c0f8b9cf8a523e2943dbf2ce0a5a2d74b959"}`. This is historical requester-provided evidence for health/build identity at that time, not a fresh independent probe.
- Subsequent independent probes from the available tool environment could not retrieve the host. That is inconclusive about whether Render is currently up; it is not a confirmed outage.
- Current `render.yaml` on `main` sets `EPER_UAT_API_ENABLED=false` and `EPER_LOCAL_CAPABILITY_API=false`. Therefore the health endpoint does not establish that capability execution is enabled. Do not turn on a public bearer-token route or change the security posture without the authorized environment/security owner’s approval and secure secret configuration.
- The latest readiness-plan commit’s container-smoke workflow passed but published no runtime image artifact. This is a workflow/artifact gap, not a runtime test failure.

### Next operational sequence

1. Re-run the protected **EPER Authorized UAT Target Preflight** only if the approved host allowlist, protected environment/reviewers, expected deployed build ID and service-owner authorization are verified. Preserve the workflow artifact; do not treat the historic health response as a current preflight.
2. Have the environment/security owner confirm whether the six-family test API may be enabled for the UAT session. Keep it disabled until approved. Prefer a private/allowlisted or identity-gated execution route; never put bearer tokens in source, issue comments or evidence.
3. If public execution is not approved, use the controlled local container runbook with a checksum-verified runtime artifact. The current runtime-smoke workflow has not produced a downloadable artifact for the latest plan commit, so repair that artifact path before claiming local container execution.
4. Only after a safe executable target and session authorization exist, proceed to the six canonical Chapter 463 business journeys; keep each case `NOT_RUN` until actual authorized steps/results/evidence are captured.

This section corrects target status without authorizing execution or changing canonical UAT records.


## 8. RC4 artifact inspected locally — 2026-10-19

Artifact ID `11306122539` was downloaded from the recorded GitHub Actions release artifact and inspected locally.

- Outer ZIP SHA-256: `7206c96e72ce6a3279cd62063a694c3c4ecc558d92ae66622297a988f87e075a` — matches the digest recorded in the existing preflight evidence.
- Inner npm tarball SHA-256: `93cdc02a685faa9c4385d2d0cb142dd8704a6743a36c805b36e5de4d02605bca` — matches the artifact's included checksum file.
- Embedded metadata: RC4, commit `13dc7fa94a4c0998d94e22a361d6e5790eee1183`, build date 2026-10-04, explicitly classified `RELEASE CANDIDATE BUILD — NOT RELEASED / NOT PRODUCTION`.
- Package contains the compiled requirement modules and capability-router/contracts output, but does **not** contain the API server, the local container runtime, or the test suite required by the local six-family HTTP runner. It is an integrity-verified package, not an executable UAT target.
- The artifact commit is not the readiness-plan commit `3cb76ed403241504dc94d825b9f7b926b384788c` or the subsequent plan-update commit. Do not use it as evidence that the latest candidate is runnable.

**Disposition:** RC4 artifact integrity is VERIFIED; artifact suitability for local HTTP UAT is NOT SUITABLE. The correct next engineering fix is to update the controlled runtime-smoke/release workflow to emit a versioned executable runtime artifact (or a deliberately supported local bundle including server + runner dependencies) for the exact intended commit, then verify checksum/build identity and execute the loopback smoke. Do not promote RC4 to business UAT, and do not change any canonical case outcome.


## 9. PR runtime artifact now produced and integrity checked — 2026-10-19

The modified container workflow on PR #165 completed successfully and published GitHub Actions artifact ID `12195063132`, named `eper-runtime-image-b6cd8c5779dcd7c081781414fe04dc268bc7623c`.

- Workflow run: `39271287455` — Container Runtime Smoke Test, conclusion `success`.
- Related PR workflows all completed successfully: EPER CI `39271287341`, pilot matrix `39271287383`, six-family HTTP smoke `39271287361`, release candidate `39271287340`, G9 reconciliation `39271287327`.
- Downloaded outer ZIP SHA-256: `0be476062e73ff90f821094757ec323d2e9aeec7db182707e8bb649b0ca3d296`.
- Embedded image tarball checksum: `e2e5c8a1478f8f8bfb30abfdcf318c82825475b44b31a7266b5346c18fb3c646`; local `sha256sum --check` and `gzip --test` passed.
- Artifact metadata build ID: `b6cd8c5779dcd7c081781414fe04dc268bc7623c`. For a pull-request workflow, `github.sha` is the synthetic PR merge commit; the workflow's reported PR head SHA is `8d1a08e07f74cc88950554881ca4e33e98715255`. Record both; do not mislabel the artifact build ID as the branch head SHA.
- GitHub-hosted smoke successfully built, ran, verified `/health` build identity and 404 behavior, reloaded the packaged image, and verified it again.
- The assistant's current local container environment does not have Docker/a Docker daemon, so it could not independently load/run this image locally. The successful GitHub-hosted packaged-image round-trip is the current runtime evidence.

**Disposition:** Runtime artifact packaging and hosted smoke are now verified. Next technical step is to make the artifact available to the approved UAT operator or run the same controlled local runbook in an environment with Docker. This does not prove the hosted Render target is healthy, enable the capability API, or authorize business acceptance. The six canonical Chapter 463 cases remain `NOT_RUN` pending safe target/session authorization and approved oracles.
