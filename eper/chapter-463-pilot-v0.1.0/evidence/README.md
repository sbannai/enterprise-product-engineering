# G4 Evidence Directory

This directory contains the controlled evidence definition for Chapter 463 engineering execution.

## Files

- `G4-EVIDENCE-BUNDLE.md` — human-readable evidence gate and requirement mapping.
- `G4-MANIFEST.json` — machine-readable evidence manifest and execution placeholders.

## Evidence rule

Only an actual identified CI execution may populate the execution record. The checked-in `test-output.txt` is a candidate/local output record and is not, by itself, authoritative G4 execution evidence.

Once a CI run exists, its run ID, commit SHA, job ID, runtime, timestamp, result counts, artifact ID and job-log reference must be recorded against the same source revision.
