# EPER Provider Runtime and Customer Asset PR Dependency Map

**Reviewed:** 2026-11-05 03:33 UTC
**Branch carrying this record:** feat/provider-runtime-adapter-registry
**Approved baseline:** 228 requirements / 38 chapters; unchanged.

## Asset delivery chain

```text
#384 tenant-isolated customer asset repository foundation
  -> #386 upload idempotency reservation
    -> #393 asset + provider worker stack integration
      -> #394 PostgreSQL asset download authorization
      -> #396 exhausted scan-lease recovery
      -> #395 provider-neutral storage catalogue metadata (parallel metadata child)
      -> #399 customer asset upload workspace UI (draft; based on integration stack)
```

Dependency caveat: #399's UI/API flow is not proof of real binary transfer. Production API composition still needs concrete upload-grant, object-verification, malware-scan and signed-download drivers. Keep the child stacked until its full dependency chain is reconciled; do not merge it independently.

## Provider execution chain

```text
#392 provider worker runtime / payload-integrity foundation
  -> #393 integrated provider-operation worker and asset stack
    -> #395 catalogue metadata (descriptive only; not executable)
    -> #398 version-pinned runtime adapter registry + credential boundary (draft)
```

PR #398 exact head: d8f0ad73dd4ea2b37a1d6802251d50ecfe1c916c.
PR #398 exact-head PR-triggered CI: 6/6 successful (runs 41960471591, 41960471694, 41960471681, 41960471676, 41960471550, 41960471564).
PR #399 exact head: a58a47303d2b6c54bbe9793afc8d3775fbfafc74; previously verified exact-head CI: 7/7 successful.

## Merge and release rules

- Keep #398 and #399 draft/open; no merge is authorized by green CI alone.
- Preserve the dependency order and reconcile branch base/head SHAs before any consolidation.
- #395 is catalogue metadata only; it must never be treated as an executable provider adapter.
- #398 production runtime remains disabled until concrete approved adapters, cryptographically trustworthy provenance, secret-manager/key custody, least-privilege worker DB role, durable production queue/payload/audit stores, independent supervision, readiness/liveness, alerting and process-level shutdown/recovery evidence exist.
- Do not use synthetic drivers in production. Do not introduce unrestricted dynamic module loading.
- No cloud provisioning, production credentials, real provider dispatch, or Business UAT authorization.
- Keep customer binary transfer blocked until upload grant, object verification, malware scan and download authorization are all implemented and tested end to end.
- Preserve the approved 228 requirements across 38 chapters. Draft candidates remain additive and require owner disposition.

## Immediate next engineering actions

1. Reconcile #398 and #399 with their full ancestor chain and confirm all required checks on each new head.
2. Implement/test provider contract validation for upload/download grants, object metadata and malware scanner outcomes using injected network-free fakes.
3. Define the production composition contract without wiring it into the API process or enabling live dispatch.
4. Extend real-PostgreSQL and browser coverage for the complete customer asset journey; distinguish metadata/browser UI tests from actual binary-transfer evidence.
5. Refresh the seven-checkpoint scorecard after each exact-head validation; never infer production readiness or Business UAT from CI success.