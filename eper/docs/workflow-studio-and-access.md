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
