# EPER — G1–G14 Gate Ownership & Sign-Off Tracker

| Gate | Gate Owner | Evidence Owner | Approver | Required Decision | Current State | Sign-Off Evidence |
|---|---|---|---|---|---|---|
| G1 | Requirements / Product | Evidence Owner | Product Authority | Source baseline accepted | PASS | Controlled source baseline |
| G2 | Architecture / Engineering | Engineering Evidence Owner | Architecture Authority | Routing baseline accepted | PASS | Registry + router evidence |
| G3 | Architecture / Product | Design Evidence Owner | Architecture Authority | Exact HLD/LLD traceability accepted | OPEN / SOURCE CONTROLLED | Authoritative locators required |
| G4 | Architecture / Engineering | Contract Owner | Architecture Authority | Contract governance accepted | PASS at shared boundary | Contract integrity evidence |
| G5 | Engineering | Engineering Evidence Owner | Engineering Lead | Implementation/build accepted | PASS | Build/typecheck/test evidence |
| G6 | QA / Engineering | QA Evidence Owner | QA Authority | Verification baseline accepted | PASS for engineering verification | CI + executable tests |
| G7 | Business / UAT | UAT Evidence Owner | Business Authority | UAT/business acceptance | PENDING | UAT decision + dated approval |
| G8 | QA / Evidence | Evidence Owner | Freeze Authority | Freeze entry approved | PREPARED / NOT EXECUTED | Freeze-entry sign-off |
| G9 | Evidence / QA | Evidence Owner | Authorized Freeze Authority | Traceability baseline frozen | PENDING / NOT FROZEN | CI PASS + reconciliation + freeze decision |
| G10 | Engineering / QA | Engineering Evidence Owner | Engineering Authority | Implementation closure accepted | PASS — implementation only | Closure evidence + CI |
| G11 | Release Management | Release Evidence Owner | Release Authority | Controlled release approved | PENDING | Release approval/package |
| G12 | Operations / SRE | OPS Evidence Owner | Operations Authority | Production validation accepted | PENDING | Production/OPS sign-off |
| G13 | Business / Certification | Acceptance Evidence Owner | Certification Authority | Final acceptance/certification | PENDING | Authorized final decision |
| G14 | Audit / Closure | Closure Evidence Owner | Audit/Closure Authority | Controlled audit closure accepted | PENDING | Frozen archive + certificates + sign-offs |

## Sign-off rule
No gate is promoted solely from implementation evidence. The named approver must authorize the gate decision using the required evidence package.

## G9 hold
G9 remains PENDING / NOT FROZEN until the CI result is verified, downstream evidence is reconciled, and the authorized traceability-freeze decision is recorded.
