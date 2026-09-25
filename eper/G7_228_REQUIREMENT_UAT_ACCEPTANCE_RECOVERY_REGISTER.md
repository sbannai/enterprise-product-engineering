# EPER — G7 Batch UAT & Acceptance Recovery Register

## Scope
Chapters 463–500 | 38 chapters | 228 requirements

## Controlled purpose
This register establishes the single batch-level working register for recovering authoritative UAT, business acceptance, defect/retest, release and operations evidence for all 228 requirements.

It is a recovery register, not an acceptance certificate. No requirement is promoted to ACCEPTED by population of this register.

## Batch baseline

- Chapters: 38
- Requirements: 228
- Requirements per chapter: 6
- UAT accepted at baseline: 0
- Requirement acceptance closed at baseline: 0
- Current requirement state: OPEN / ACCEPTANCE_PENDING

## Requirement-level control fields

Every one of the 228 records is tracked with:

**Chapter → Requirement → SRS → Sequence → Pattern → UAT Case/Session → UAT Run → Environment → UAT Date → UAT Result → Business Authority → Business Decision → Defect/Retest → Release → Release Gate → OPS/Production → OPS Result → Acceptance State → Gap ID**

All downstream evidence fields are initially PENDING unless attributable authoritative evidence is recovered.

## Master gap register

| Gap ID | Scope | Required evidence | Current state | Status |
|---|---|---|---|---|
| UAT-463-500-001 | All 228 | Exact UAT case/session, execution, environment, date, result and business authority | 0 evidenced | OPEN |
| ACPT-463-500-001 | All 228 | Explicit requirement-level acceptance decision | 0 evidenced | OPEN |
| DEF-463-500-001 | All 228 | Defect/retest/approved disposition where applicable | Not evidenced | OPEN |
| REL-463-500-001 | Release-applicable | Release candidate, gate decision and approval | 0 closed | OPEN |
| OPS-463-500-001 | Release-applicable | Actual operational execution evidence | 0 accepted | OPEN |
| PROD-463-500-001 | Production-applicable | Actual deployment/release evidence | 0 accepted | OPEN |
| FREEZE-463-500-001 | All 228 | Release-specific frozen traceability baseline | Not frozen | OPEN |

## Chapter batch control

Each chapter is represented by exactly six requirements. Chapters 463–500 are included in the single batch register.

For every chapter:

- Requirements = 6
- UAT accepted = 0 at baseline
- Acceptance closed = 0 at baseline
- Open = 6

## Evidence rules

1. Exact UAT execution evidence is required; documentation of a test scenario alone is insufficient.
2. Business acceptance must identify the accountable authority and explicit decision.
3. Failed or excepted criteria require defect/retest or authorized disposition.
4. Release evidence must identify the applicable candidate/build and gate decision.
5. Production/OPS claims require actual execution evidence.
6. Missing evidence remains OPEN/PENDING.
7. No evidence identifier, result, approval or acceptance decision may be inferred or fabricated.
8. G9 traceability freeze remains blocked until the mandatory downstream evidence joins reconcile.

## Controlled conclusion

The 38-chapter / 228-requirement G7 recovery register is now established as one batch. The next progress must come from attributable evidence population into these fields, not creation of additional planning artifacts.
