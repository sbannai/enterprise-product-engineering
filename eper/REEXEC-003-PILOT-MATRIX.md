# EPER automated chapter pilot matrix

This runner executes the existing test suite in each pilot package for Chapters 463–500 and emits a row for each of the 228 requirement IDs.

## Run locally

Requires Node.js 20+ and npm.

```bash
node eper/scripts/run-chapter-pilot-matrix.mjs
```

Outputs are written to `eper/reexec-evidence/`:

- `chapter-pilot-matrix.json` — run metadata, chapter suite results, and 228 requirement rows.
- `requirement-test-matrix.csv` — one row per requirement, including whether a requirement-specific test title was observed and whether the ID appears in the test source.
- `chapter-summary.csv` — one row per chapter.
- `chapter-NNN-test.log` — captured output for each chapter test run.

## Evidence boundary

A green chapter suite means the checked-in pilot tests passed in the runner. It does not establish that the original product is deployed, that the tests exercised a production-like application for all chapters, that OAuth was integrated, or that a business owner accepted the requirements. The Chapter 463 package has a limited HTTP smoke test against its local pilot server; other chapter packages may test domain functions only. The generated matrix labels these distinctions and never sets business acceptance or formal UAT sign-off to PASS.

The existing pilot packages explicitly describe themselves as candidate implementations, not historical or production evidence. Review each package's `IMPLEMENTATION_STATUS.md` before using results for a gate decision.
