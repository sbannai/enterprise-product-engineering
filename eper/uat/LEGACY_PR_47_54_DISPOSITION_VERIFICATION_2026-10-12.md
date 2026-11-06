# Legacy PR Disposition Verification — 2026-10-12

Status: verification note; not a business-acceptance decision.

## Scope

Check whether the functional changes from closed, unmerged PRs #47 and #54 are present in the current `main` branch before attempting any reopen or cherry-pick.

## Evidence inspected on `main`

- `eper/packages/capabilities/services.ts`: `AuthorizationService.execute` requires the request principal to match the authenticated context principal and throws `AUTHORIZATION_PRINCIPAL_MISMATCH` otherwise.
- `eper/tests/tenant-context-enforcement.test.mjs`: current tests include tenant-context rejection and use the current capability service.
- `eper/tests/exception-handling.test.mjs`: current test `retry count increments only on retry transitions` checks initial count 0, retry transitions incrementing the count, and escalation/resolution preserving it.

## PR disposition

| PR | Historical purpose | Current-source finding | Action |
|---|---|---|---|
| #47 | Bind authorization subject to authenticated principal | Core principal-match guard is present in `main` | Do not reopen or merge stale branch; preserve this finding and run current-main CI as needed |
| #54 | Test exception retry-count invariants | Retry-count invariant test is present in `main` | Do not reopen or merge stale branch; preserve this finding and run current-main CI as needed |
| #56 | Populate B01 SRS references | Previously confirmed merged | No further action here |

## Limitations

This is a source-presence check, not a proof that every historical diff hunk was merged verbatim. Branch comparisons showed #47's branch was 6 commits ahead and 207 behind the current merge base; #54's branch was 1 commit ahead and 202 behind. Do not merge either stale branch wholesale. If a future test identifies a missing behavior, implement a narrow new change from current `main`.

## EPER guardrails

- Preserve all 228 requirements and 38 chapters.
- Keep `EPER_UAT_API_ENABLED=false`.
- Do not provision chargeable AWS resources.
- Business UAT remains HOLD; code/test presence is not business acceptance.
