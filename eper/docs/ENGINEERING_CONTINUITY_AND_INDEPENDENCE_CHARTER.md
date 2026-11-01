# EPER Engineering Continuity & Independence Charter

**Status:** Proposed operating charter — requires owner review  
**Created:** 2026-11-01  
**Repository baseline:** `a42d88c9a9d2c00c0c5873fb570f6b44d557ef6f`  
**Product source of truth:** https://github.com/sbannai/enterprise-product-engineering  
**Scope guard:** Preserve the approved 228 requirements across Chapters 463–500. This charter adds operating controls; it does not replace or silently amend approved requirements.

## 1. Mission

EPER must remain buildable, testable, operable and evolvable without depending on a single AI assistant, subscription, chat history, individual developer or cloud vendor. ChatGPT is an optional engineering aid, never the system of record or runtime dependency.

Completion means demonstrated product behavior and operational evidence—not a green CI badge, a merged PR, a design document or a claimed percentage.

## 2. Non-negotiable owner decisions

1. Preserve the approved 228 requirements and 38-chapter mapping. Add new requirements through a versioned requirements-register change with rationale, owner, acceptance criteria, traceability and impact assessment.
2. PostgreSQL is the target durable persistence engine. Local development and integration tests first; do not provision chargeable AWS resources without separate explicit authorization.
3. Maintain tenant and application isolation, RBAC, append-only auditability, idempotency, data integrity and secure secret handling.
4. Keep API, UI and database capability maturity aligned. A feature is not complete if one layer is only a mock or placeholder.
5. Scheduler semantics: workers should be independently hosted, continuously available processes that claim due work safely; avoid a timer-polling design as the sole execution mechanism. Persist schedules, leases, retries and execution outcomes.
6. AI integrations must remain provider-neutral. External actions, CRM writes and consequential customer-facing actions require human approval unless the owner explicitly changes that policy.
7. No Business UAT or production-readiness declaration until the applicable entry criteria are evidenced and approved by the owner.
8. No orphan branches or PRs: every change is merged, explicitly superseded/closed with rationale, or retained with an accountable owner and next action.

## 3. Source-of-truth hierarchy

| Artifact | Canonical location / rule |
|---|---|
| Source code and history | Git repository; `main` is the integrated baseline |
| Approved requirements | Versioned requirements register and traceability records in `eper/docs` |
| UX baseline | Owner-approved Customer Admin Workspace Wireframe v34; preserve source artifact and record later approved deltas |
| Architecture and decisions | Versioned HLD/LLD/design documents plus decision records |
| Work status | GitHub issues/PRs and versioned delivery tracker; every status links to evidence |
| Test evidence | Exact commit SHA, workflow/run URL, test report and environment/configuration |
| Secrets | Approved secret manager or local environment; never commit secrets or export them into handover documents |
| Runtime data | PostgreSQL and approved object storage; never treat chat history or spreadsheets as runtime storage |

If two records disagree, stop and reconcile them; do not silently choose the more optimistic status.

## 4. Definition of done

A capability is complete only when all applicable checks pass:

- Requirement IDs and acceptance criteria are mapped to implementation and tests.
- Tenant/application authorization is enforced server-side and tested for cross-tenant denial.
- API contracts, validation, error responses and authorization are implemented.
- UI supports the real workflow, loading/empty/error/success states and role-appropriate actions.
- PostgreSQL schema, migrations, constraints, indexes, RLS policies and rollback/recovery implications are reviewed.
- Audit events, idempotency, retries and concurrency behavior are tested where relevant.
- Unit, integration, API, UI and end-to-end tests pass on the exact candidate commit.
- Operational logs, metrics, alerts, backup/restore and support procedures exist for production-bound behavior.
- Documentation and requirements traceability are updated in the same delivery increment.
- PR review is resolved; exact-head CI is green; merge is verified on `main`.
- Production and business acceptance are separate explicit gates.

## 5. Release and repository controls

- Use short-lived feature branches from current `main`; avoid stacking dependent PRs where practical.
- Require review and exact-head CI before merge. Protect `main` with required checks and prohibit force pushes once the owner approves the repository rules.
- Re-run validation after rebases or material base changes. A green run on an obsolete head is not evidence for the new head.
- Use squash or another agreed merge strategy consistently; record the resulting merge SHA.
- After merge, verify the commit is on `main`, update the delivery tracker, and close or supersede related branches.
- Never merge solely to reduce PR count. Never claim a merge, test, deployment or acceptance that the platform did not confirm.
- Keep release artifacts reproducible and tied to source SHA; maintain rollback instructions.

## 6. Independent developer handover

A new engineer should be able to complete this sequence using repository instructions alone:

1. Clone the repository and read the root README, contribution guide, architecture index, requirements register and current delivery plan.
2. Install the pinned runtime/toolchain and dependencies using documented commands.
3. Configure local environment variables from a checked-in example file; obtain secrets through the owner's approved channel.
4. Start local PostgreSQL using the documented development setup; apply migrations from a clean database and verify repeatability.
5. Run formatting, lint, typecheck, unit tests, integration tests and the full CI-equivalent command set.
6. Start API, UI and worker processes locally; verify health endpoints and a documented end-to-end customer journey.
7. Create a scoped branch, implement a requirement-linked change, add regression tests, open a PR and attach evidence.
8. Merge only after review and exact-head CI; verify the resulting commit on `main`.

The repository must maintain exact commands, supported versions, expected outputs and known troubleshooting steps. A handover that requires undocumented knowledge from a chat is incomplete.

## 7. Operational independence

Production readiness requires, at minimum:

- Independently deployed and supervised API and worker processes, health checks, restart policy and graceful shutdown.
- Restricted service identities and least-privilege database roles, including distinct customer/admin/platform-worker contexts.
- PostgreSQL migration, backup, restore and disaster-recovery runbooks with tested recovery objectives.
- Outbox delivery observability: backlog age/depth, attempts, lease expiry/loss, dead-letter volume, replay audit and dispatch failures.
- Alert routing, incident ownership, support queue, escalation and customer communication procedures.
- Secure configuration, key rotation, vulnerability/dependency updates and audit-log retention.
- Capacity/load, concurrency, failure-injection and recovery evidence.
- Deployment and rollback procedures that do not require chargeable cloud provisioning during local/integration development.

## 8. AI and automation independence

AI coding assistants may inspect issues, explain code, draft tests, propose patches and prepare PRs. They must not become the only holder of requirements or decisions.

- Keep prompts, task instructions and agent operating rules in version control where safe.
- Use provider-neutral interfaces and retain a documented manual workflow.
- Require human review for code merges, deployments, schema/data migrations, customer data access, external dispatch and CRM writes.
- Give agents least-privilege, scoped credentials; never place secrets in prompts or logs.
- Record agent-produced changes as ordinary commits and PRs with tests and accountable human ownership.
- Scheduled reports are advisory. GitHub and the runtime remain authoritative.

## 9. Delivery control cadence

Maintain a seven-checkpoint view with a stable definition for each checkpoint. Every update must show: current status, evidence link/commit SHA, blockers, next action, accountable owner and change since the previous update. Do not invent percentages or infer completion from PR count.

Daily: reconcile PRs/issues, exact-head CI, blockers, requirement changes and integrated functionality.  
Weekly: review end-to-end customer journeys, security/isolation, persistence, operational readiness, risks and next release slice.  
At each release: publish a signed-off evidence bundle with source SHA, migration version, test results, known limitations and rollback plan.

## 10. Current baseline and known boundary (2026-11-01)

- Integrated `main` baseline at charter creation: `a42d88c9a9d2c00c0c5873fb570f6b44d557ef6f`.
- Workflow execution and transactional outbox capabilities have meaningful CI-validated implementation, including lease renewal/fencing, dead-letter handling and audited tenant-scoped inspection/replay.
- Workflow outbox production operation is not complete: restricted platform-worker context wiring, approved external dispatcher, independent host supervision, delivery dashboards/alerts, load/recovery evidence and deployment configuration remain outstanding.
- Technical CI does not establish production readiness or Business UAT authorization.
- Repository branch protection and required status checks were not enabled at this baseline and need an owner-approved hardening change.
- The complete product scope is broader than the workflow slice. Capability completion must be assessed against the approved requirements register and customer journeys, not this one subsystem.

## 11. Continuity acceptance checklist

- [ ] Requirements register and approved wireframe baseline are present and versioned.
- [ ] Architecture, decision log, data model, API contracts and event catalogue are current.
- [ ] Local setup works from a clean clone without undocumented chat context.
- [ ] PostgreSQL migrations and integration tests run from a clean database.
- [ ] Developer, tester and support responsibilities and access are assigned.
- [ ] CI, branch protection and release evidence controls are active.
- [ ] Current PR/issue register has no unexplained orphan work.
- [ ] Backup/restore, incident, deployment and rollback runbooks are tested.
- [ ] Worker hosting, dispatcher, monitoring and recovery controls are proven.
- [ ] A second engineer can independently build, test and release a change.
- [ ] Owner reviews and approves the continuity handover.

**Owner decision required:** approve this charter, nominate accountable engineering/QA/operations owners, and approve repository protection settings. Until then this is a proposed control baseline, not an assertion that those controls are already active.
