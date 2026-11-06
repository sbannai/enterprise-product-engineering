# Chapter 463 CI Execution

The repository workflow is `.github/workflows/eper-chapter-463.yml`.

## Trigger

A push affecting `eper/chapter-463-pilot-v0.1.0/**` or the workflow file triggers the job automatically. If repository Actions UI exposes manual dispatch, run **EPER Chapter 463** from the Actions tab.

## Evidence produced

The job executes `npm test` under Node.js 20 and captures the actual stdout/stderr in `ci-test-output.txt`. It also generates `execution-metadata.md` containing the executed commit, run ID, workflow name and UTC execution time. Both are uploaded as the `eper-chapter-463-execution` artifact.

## G4 rule

Do not mark G4 PASS until a real workflow run exists and its job result, executed commit, logs and retained artifact are identified.
