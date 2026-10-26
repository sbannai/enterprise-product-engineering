# Requirement Source/Test Evidence Matrix — 2026-10-26

**Status:** Audit evidence index; not an acceptance register.  
**Population:** 228 requirements across Chapters 463–500.  
**Matrix:** `eper/REQUIREMENT_SOURCE_TEST_EVIDENCE_MATRIX_2026-10-26.csv`.

## What was reconciled

Each requirement row maps its ID, chapter, sequence, capability and service to both (a) the pilot test file used by the historical execution workflow (`chapter-<chapter>-pilot-v0.1.0/test/chapter<chapter>.test.js`) and (b) the separate `requirement-acceptance-wave-NN.test.mjs` source-mapping file. These are distinct fields: the source-mapping file is not represented as the file that produced the historical PASS. The controlled acceptance register was joined by exact requirement ID to preserve the distinction between historical pilot evidence and approved acceptance evidence.

## Reconciled counts

| Evidence dimension | Count |
|---|---:|
| Requirements mapped to pilot test source | 228/228 |
| Historical automated pilot evidence recorded as PASS | 228/228 |
| Approved measurable acceptance criteria | 0/228 |
| Controlled requirement acceptance tests recorded | 0/228 |
| Controlled acceptance-test execution recorded | 0/228 |
| Business UAT acceptance recorded | 0/228 |
| Release evidence recorded | 0/228 |
| Production closure recorded | 0/228 |
| Traceability freeze recorded | 0/228 |

## Interpretation

The 38 `requirement-acceptance-wave-NN.test.mjs` source-mapping files each contain six requirement IDs and six test declarations. The historical pilot workflow's executed files are recorded separately in `pilot_test_file`; the available pilot evidence records a historical passing execution against commit `1142a5ccf34538a77089c3b6a0592a359a03101d` (run `37188613347`). That is useful traceability and capability-pilot evidence.

It is not proof that each requirement's business oracle is approved, that a controlled acceptance case has been executed, or that Business UAT has passed. The CSV intentionally leaves the requirement-level acceptance and closure fields unpromoted.

The execution register's legacy `executableAcceptanceTest=true` field is not used to infer controlled acceptance: the acceptance register's explicit evidence fields remain authoritative for acceptance status.

## Next action

For each requirement, locate the authoritative approved BRD/SRS criterion. Use existing approved measurable criteria when available; otherwise create a consolidated owner-decision list with exact source, ambiguity, proposed measurable oracle, and decision required. Only after the criterion is approved should a controlled acceptance case and evidence-linked execution be added.

**Business UAT remains unauthorized.** No release or production closure is asserted by this matrix.
