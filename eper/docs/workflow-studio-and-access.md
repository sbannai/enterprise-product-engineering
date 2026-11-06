# Workflow Studio, Role Access and Generated Task UI

## Routes

The controlled admin UI is available at `GET /admin/workflow-ui` when `EPER_ADMIN_CONFIG_API_ENABLED=true`. It shares the admin bearer-token configuration with the pricing/payment console.

| Method | Route | Purpose |
|---|---|---|
| GET | `/admin/config/workflows` | Read workflow definitions |
| PUT | `/admin/config/workflows` | Validate and replace workflow definitions |
| GET | `/admin/config/roles-access` | Read role, member, and permission mappings |
| PUT | `/admin/config/roles-access` | Validate and replace role/access mappings |
| POST | `/admin/config/access-check` | Evaluate a principal's configured permission, optionally for a workflow |

All endpoints require `Authorization: Bearer <EPER_ADMIN_CONFIG_API_TOKEN>`. The token must be at least 32 characters and the admin config API must be explicitly enabled. The UI does not persist the token in browser storage.

## Workflow definition shape

A workflow has a stable `id`, `name`, optional `description`, `status` (`DRAFT` or `ACTIVE`), and ordered `activities`. Each activity has a stable ID, title, type (`TASK`, `FORM`, or `APPROVAL`), assigned `roleId`, required permission (`workflow:act` or `workflow:approve`), `nextActivityIds`, and a list of form fields.

Supported generated field types are `text`, `textarea`, `number`, `date`, `select`, and `checkbox`. Select fields carry explicit `options`. Activity IDs must be unique within the workflow; transition targets must refer to an activity in that workflow; assigned roles must exist. Invalid definitions fail closed.

## Role and permission model

Roles contain a stable ID, display name, description, member principal IDs, and a least-privilege permission set. Supported permissions are:

- `workflow:view`
- `workflow:act`
- `workflow:approve`
- `workflow:admin`
- `role:assign`
- `access:manage`

The access-check endpoint resolves role membership and permission grants and denies when no matching role grants access. When a workflow ID is supplied, missing or non-active workflows are denied. The generated task preview hides tasks unless the selected principal is a member of the assigned role and has workflow view/admin permission; action buttons remain disabled unless the role membership and activity permission match.

## Application toast center

`apps/api/app-toast.ts` provides a shared accessible toast region for success, error, warning, and informational messages. It uses text-only DOM content (not untrusted HTML), live announcements, dismiss controls, reduced-motion support, bounded visible notifications, and automatic dismissal. The pricing/payment and workflow consoles both use this shared component. New front-end surfaces should import and reuse it rather than creating page-specific notification systems.

## Pilot boundaries and production requirements

- Workflow and role configuration is process-memory only and is lost when the API process restarts.
- The admin bearer token protects configuration routes. The access-check API is an admin policy tester; it is not an end-user identity provider and should not be exposed as a self-service authorization oracle.
- Generated task forms are previews. The preview action buttons deliberately do not submit business transactions; no workflow execution API has been connected in this change.
- Production use still requires integration with the approved identity provider, authenticated tenant/principal context, server-side authorization middleware on every protected business operation, durable workflow persistence, audit logging, versioning, maker-checker approval, and business owner sign-off.
- No AWS resources are provisioned and no live payment processing is enabled by this work.
- The 228 requirement IDs, 38 chapters, and Option A remain unchanged.


## Customer Admin Workflow Studio and deterministic routing — 2026-11-02

The customer authoring entry point is `GET /customer/workflow-studio` (the legacy `/admin/workflow-ui` alias remains for compatibility). The UI now includes an activity editor, a visual activity/transition map, a basic rule builder, and rule references on activities. It saves rule definitions and activity routing references as part of the same workflow configuration snapshot.

### Ownership and authorization

- In durable PostgreSQL configuration mode, workflow definitions, role/access configuration and the workflow policy tester require a trusted identity mapped with `roleKey: "customer_admin"`.
- Tenant and actor identity are resolved server-side from the configured identity mapping; tenant/application identifiers are not trusted from the browser payload.
- Application-scoped workflow role administration and publication routes also require `customer_admin`, active tenant/application assignment, and actor/application assignment.
- Product Admin and Platform Admin do not receive customer workflow-authoring rights through these endpoints. They retain platform-level governance responsibilities.
- The page is a static UI shell; the API is the authorization boundary. Durable mode must be used for the tenant-scoped behavior described here.

### Rule model and runtime

Workflow definitions may include a version-pinned `rules` collection. Activities may attach `routingRuleIds`. A rule has a stable ID, name, numeric priority, permitted target activity, and a typed expression. Supported expression forms are nested `all`, `any`, `not`, and conditions using `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `contains`, and `exists`.

- Rule field paths are bounded, safe property paths; evaluation uses own-property access only and does not execute scripts, SQL or expressions supplied as code.
- Numeric comparisons do not coerce strings.
- Highest-priority matching rule selects the outgoing activity. No match and equal-priority ambiguity fail closed.
- A rule target must be one of the source activity's declared outgoing transitions.
- Publisher validation applies the same rule graph validation before creating an immutable workflow version.
- Runtime evaluates attached routing rules against the instance's merged workflow data after the authorized activity payload is validated. The chosen transition remains within the published definition's outgoing edges.
- Rule definitions are embedded in the immutable published workflow JSONB snapshot; existing instances remain pinned to the original version.

### Current UI scope and remaining work

The current UI provides a simple single-condition authoring form for routing rules and a visual activity/transition overview. Application-scoped draft list/read/save APIs and PostgreSQL persistence now exist, with optimistic version checks and a separate publish hand-off to immutable workflow versions. The UI selects an application, loads its workflow roles and drafts, saves a new draft version, and can publish that draft. The domain evaluator supports nested boolean groups, but a multi-condition visual group editor, richer drag-and-drop graph editing, full actor-role assignment management inside the studio, and a customer OIDC-session-backed browser experience remain follow-on work. Do not describe those as complete. The existing preview still does not execute a business transaction.

The current change is an initial integrated vertical slice, not a declaration that all of EPER-CW-056/057 acceptance criteria are complete. End-to-end browser validation, tenant-boundary negative tests, durable draft concurrency tests, publication approval lifecycle, and runtime rule-routing integration tests must pass before capability status is upgraded.


### Application-scoped draft API and lifecycle

Migration `009_workflow_definition_drafts.sql` adds `eper_workflow_definition_drafts` with forced tenant/application row-level security. The API host readiness-checks the store before starting when workflow execution is enabled.

- `GET /admin/applications/:applicationId/workflow-definitions` lists only drafts in the authorized application.
- `GET /admin/applications/:applicationId/workflow-definitions/:workflowId/draft` reads one draft.
- `PUT /admin/applications/:applicationId/workflow-definitions/:workflowId/draft` validates the workflow against active application roles and saves with an expected draft version.
- `POST /admin/applications/:applicationId/workflow-definitions/:workflowId/publish` publishes the saved draft as a new immutable version; it does not mutate existing instances.
- Every draft save rechecks active tenant/application and actor/application assignments in the transaction, takes an application/workflow advisory lock, checks the expected version, and appends an audit event atomically.
- The Customer Workflow Studio now selects an application, loads its workflow drafts and role definitions, saves application-scoped drafts, and invokes the publish hand-off. Actor-to-role assignments remain separately administered and are checked by the preview/runtime APIs.
