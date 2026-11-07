# Contributing

EPER's functional source of truth is `main`. See [Main-Branch-Only Functional Delivery Policy](docs/engineering/MAIN_BRANCH_ONLY_FUNCTIONAL_DELIVERY_POLICY.md).

## Delivery rules

- Build and validate every capability against the latest `main` baseline.
- Keep `main` independently buildable and usable; do not make functionality depend on an open, draft, stacked or stale PR.
- Use small, reviewable changes. A feature branch or PR may be used for review, but it is an integration aid—not a runtime dependency or a reason to withhold an approved capability from `main`.
- Integrate coherent slices onto `main` only after applicable review and exact-head checks pass. Never blindly merge stacked branches or cherry-pick stale commits.
- Record the exact resulting `main` SHA and relevant test evidence when reporting a capability as delivered.
- Use semantic commit messages.
- Preserve tenant isolation, server-derived identity, PostgreSQL durability, replay-safe migrations, least privilege, RLS, auditability and fail-closed security.
- Do not change the approved 228 requirements / 38 chapter baseline without explicit owner approval.
- Do not authorize Business UAT, production deployment, external provider dispatch or chargeable cloud provisioning through a code contribution.

A PR that is blocked or superseded must not block an independently deliverable mainline capability. Close it only after its scope is integrated, replaced or explicitly withdrawn and the disposition is recorded.
