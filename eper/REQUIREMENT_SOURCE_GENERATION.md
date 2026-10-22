# EPER — Requirement Source Generation

## Purpose

Make the 228 requirement modules reproducible TypeScript source rather than hand-maintained placeholder files or HTML-only artifacts.

## Generator

- Source of truth: `packages/requirements/registry.ts`.
- Generator: `scripts/generate-requirements.mjs`.
- Output: `requirements/REQ-xxxxx/index.ts` for each registry binding.
- Every generated module exports the requirement binding, BRD/SRS/chapter/pattern/capability/service/data/API/event traceability metadata, and an executable `execute(input, services)` function routed through the shared capability router.
- The generator fails closed unless it parses exactly 228 unique requirements, covering the expected 38 chapters and six capability patterns.
- `npm run build`, `npm run typecheck`, and `npm test` run source generation before TypeScript compilation/testing.

## Important implementation boundary

Generated modules are executable requirement-specific adapters to the six shared capability services. This does not mean every domain acceptance criterion has been independently implemented. The existing implementation audit correctly distinguishes routing and contract integrity from requirement-specific business behavior.

Remaining engineering work includes reconciling authoritative BRD/SRS acceptance criteria for each requirement, implementing reusable domain rules in the six capability services, durable production-grade persistence, authentication/authorization integration, and requirement-mapped acceptance tests. A generic adapter must not be reported as production-complete solely because it compiles or routes.

## Validation

The generator's registry-pattern check matches 228 unique entries, chapters 463–500 (38 chapters), and patterns XX01–XX06. The commit's GitHub Actions build and test checks must finish successfully before declaring the generated output CI-verified.

## Guardrails

- Do not change the 228 requirement IDs, BRD/SRS mappings, or 38-chapter baseline without explicit approval.
- Do not replace executable TypeScript with HTML. HTML POCs and wireframes are supplementary artifacts.
- Simulated execution and CI evidence are not real-world UAT approval or production release evidence.