# EPER Audit Trail Release-Gate Checklist

**Status:** Open / not release-certified  
**Scope invariant:** This checklist does not alter the 228 approved requirements, 38 chapters, six capability families, or existing execution router. The AUDIT-DELTA-01..05 entries remain proposed until the requirements owner approves their crosswalk.

## Gate checklist

| Gate | Required evidence | Current state | Closure rule |
|---|---|---|---|
| A1 — Event contract | Versioned event schema with trusted actor, tenant/application/environment, action/outcome, resource, UTC timestamp, correlation IDs and integrity fields | Partial implementation in PR #206 | Contract review and schema tests pass |
| A2 — Durable persistence | Audit migration applied in a controlled PostgreSQL test database; migration checksum recorded; readiness check passes | Not verified against a real database | Attach migration output and readiness result; do not infer from CI mocks |
| A3 — Append-only controls | Enabled update/delete triggers; application role lacks UPDATE/DELETE/TRUNCATE/DDL privileges | Triggers defined; least-privilege grants not evidenced | Verify effective grants with deployed application role and demonstrate denied mutation |
| A4 — Chain integrity | Verifier replays events, checks predecessor links, recomputes canonical event hashes and compares stored chain head | Writer calculates hashes; independent verifier not implemented | Tamper, missing-event, reordered-event and incorrect-head tests pass |
| A5 — Failure behavior | Audit write failure prevents acknowledgement of protected action or follows formally approved, alerted degraded-mode policy | Agent route fails closed when writer is injected; broad runtime coverage incomplete | Fault-injection evidence for every protected operation family |
| A6 — Coverage | Route/job/integration inventory mapped to expected events, including successes, denials and failures | Agent draft workflow is a partial pilot only | Coverage matrix has test evidence for each in-scope route/job |
| A7 — Search and export | Authenticated, tenant-scoped search/export with reason, bounded filters, redaction and audit-of-audit | Wireframe preview only; no live query/export | API authorization, tenant isolation and export audit tests pass |
| A8 — Retention and recovery | Approved retention/legal-hold policy, separately authorized purge, backup/restore and integrity verification | Not implemented/evidenced | Operational runbook and restore test approved |
| A9 — UI truthfulness | UI distinguishes preview from persisted evidence and does not invent integrity status | Preview-only labels and audit query/export previews added to wireframe | Product/security review confirms no misleading live-state claims |
| A10 — Release sign-off | Current-head CI, security review, requirements-owner crosswalk and named operational owner | CI last checked green on prior head 0612c332; any subsequent head must be rechecked | All applicable gates evidenced; no waived controls without approved exception |

## Required evidence package

1. Current commit SHA and complete current-head workflow status.
2. Migration checksum/ledger entry from an authorized non-production database.
3. Readiness check output for tables, chain head and append-only triggers.
4. Effective database grants for the actual application role.
5. Hash-chain verification report and tamper-detection test output.
6. Route/job coverage matrix with success, denied, failure and audit-write-failure cases.
7. Tenant-isolation, sensitive-field redaction, search/export authorization and export self-audit tests.
8. Retention, backup/restore and incident-response runbook evidence.
9. Approved crosswalk from proposed audit deltas to canonical requirement IDs, signed by the requirements owner.

## Decision rule

- **PASS:** evidence is attached, reproducible, and reviewed for every applicable gate.
- **BLOCKED:** evidence is missing, a test is pending/failing, or runtime coverage is incomplete.
- **EXCEPTION:** only through documented, time-bounded, approved risk acceptance with compensating controls and an owner. An exception is not a PASS.
- Never close a baseline requirement or claim release certification based on a wireframe, schema file, simulated UAT, or passing unrelated workflow alone.

## Current disposition

The wireframe and requirements addendum now describe the audit UI and proposed control requirements. The schema/writer/readiness prototype is present in PR #206. This is **partial implementation**, not a verified deployed audit service. No migration is asserted to have run against a real database; no AWS resource has been provisioned.
