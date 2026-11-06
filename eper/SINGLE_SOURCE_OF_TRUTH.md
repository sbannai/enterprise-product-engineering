# EPER Single Source of Truth Policy

## Authority
The GitHub repository `sbannai/enterprise-product-engineering` is the single authoritative source for EPER source code.

The `main` branch is the authoritative integrated code baseline.

## Rules
1. Source code is authored, reviewed, and retained in this repository.
2. Local working directories and ZIP archives are temporary working artifacts only.
3. A generated ZIP must never be treated as a competing source-of-truth.
4. Development branches are transient and must ultimately merge into `main`.
5. Release tags identify immutable released source states.
6. Build artifacts are outputs of the authoritative source; they are not alternate source code.
7. Requirement traceability belongs with the source under `eper/` and must reference the authoritative requirement IDs.
8. No implementation evidence is promoted from a local copy unless the corresponding source is committed to this repository.
9. Changes to EPER source must be made through Git history; manual copies outside GitHub are not authoritative.
10. If two copies disagree, `main` wins.

## Current scope
EM-OPS Chapters 463–500 comprise 228 authoritative requirements. The repository contains the current EPER generated source baseline for this scope.

## Evidence boundary
The presence of source code does not by itself establish build, test, UAT, release, production, or certification evidence. Those states require their respective records.

## Repository hygiene
Old generated ZIPs and local working folders may be retained for backup/reference, but they must not be used as active implementation sources.
