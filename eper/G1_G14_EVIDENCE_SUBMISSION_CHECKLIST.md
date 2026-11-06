# EPER — G1–G14 Evidence Submission Checklist

## Scope
Chapters 463–500 | 228 Requirements | 38 Chapters

## Submission gate control
This checklist defines the evidence that must exist before each gate can be submitted for formal approval. Checklist completion does not itself constitute approval.

| Gate | Mandatory evidence package | Current readiness | Submit only when |
|---|---|---|---|
| G1 | Authoritative BRD/SRS baseline, 228 requirement identities, chapter population reconciliation | READY | Source baseline is formally accepted |
| G2 | Registry, pattern mapping, capability/service routing, six-family reconciliation | READY | Every requirement has exactly one governed route |
| G3 | Authoritative HLD/LLD locators and requirement-level design traceability | PARTIAL | All required authoritative locators are reconciled |
| G4 | DATA/API/EVENT contracts, integrity results, requirement-level joins where applicable | READY AT SHARED BOUNDARY | Contract joins are reconciled |
| G5 | Implementation artifacts, typecheck, build, capability tests, CI evidence | READY | Controlled engineering baseline passes |
| G6 | 38 acceptance waves, 228 executable checks, results, defects/retests where applicable | READY FOR ENGINEERING VERIFICATION | Verification evidence is reconciled |
| G7 | UAT execution records, business acceptance, approver/date, defect/retest linkage | NOT READY | Authorized business/UAT acceptance exists |
| G8 | Freeze-entry checklist, evidence register, reconciliation controls, authorization | PREPARED | Freeze-entry decision is approved |
| G9 | CI PASS for reconciliation test, 228-row reconciliation, downstream evidence join, formal freeze decision | NOT READY | CI PASS + reconciliation + authorized freeze are complete |
| G10 | Implementation closure record, build/test/CI evidence, implementation acceptance | READY — IMPLEMENTATION ONLY | Implementation closure is formally accepted |
| G11 | Release candidate, version/build identity, release approval, deployment/rollback package | NOT READY | Controlled release is approved |
| G12 | Production deployment, environment identity, smoke checks, monitoring, OPS sign-off, rollback readiness | NOT READY | Production validation is accepted |
| G13 | Final business acceptance, certification decision, exception disposition, dated sign-offs | NOT READY | Authorized final acceptance/certification exists |
| G14 | Frozen traceability baseline, archive/index, certificates, exceptions, sign-offs, submission manifest and decision | NOT READY | All upstream gates are complete and submission is accepted |

## Pre-submission verification

- [ ] Requirement count = 228
- [ ] Chapter count = 38
- [ ] Six requirements per chapter
- [ ] All BRD mappings reconciled
- [ ] All SRS mappings reconciled
- [ ] All pattern/service bindings reconciled
- [ ] DATA/API/EVENT joins reconciled
- [ ] 38 acceptance waves present
- [ ] 228 executable verification entries present
- [ ] CI evidence linked to the controlled commit/run
- [ ] UAT evidence linked where required
- [ ] Release evidence linked where required
- [ ] Production/OPS evidence linked where required
- [ ] Final acceptance/certification linked where required
- [ ] Exceptions dispositioned
- [ ] Traceability freeze authorized
- [ ] Archive and certificates reconciled
- [ ] Final sign-off register complete
- [ ] Submission manifest/version/checksum controlled

## G9 hold

G9 is **PENDING / NOT FROZEN**. The reconciliation test commit exists, but CI PASS has not yet been independently verified. No downstream submission may treat G9 as closed until that evidence and the authorized freeze decision exist.

## Evidence promotion rule

A checked item means the evidence is identified or available at the stated readiness level; it does not mean the gate is approved unless the gate's required authority has issued the formal decision.
