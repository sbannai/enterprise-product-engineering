# Customer Admin Provider Connections — UI Contract

**Status:** Interaction design preview; not a production UI.
**Related API contract:** PROVIDER_CONNECTION_API_CONTRACT.md
**Preview:** ../wireframes/customer-admin-provider-connections.html

## Ownership

- **Product Admin** owns the approved provider catalogue, provider adapter eligibility, platform policy and platform-wide restrictions.
- **Customer Admin** owns customer connection setup, application bindings, permitted capability selection, validation and connection health visibility.
- **Application users** may use only the provider capabilities explicitly bound to their assigned application and granted by workflow policy.

The screen must not expose platform secret material, raw credentials, access tokens or provider payloads. The browser may display only safe connection metadata and opaque status/version values.

## Screen model

The preview contains customer-scoped connection summary counts; application filter and provider/connection search; connection rows showing provider, customer-defined display name, bound application, lifecycle state, capability summary and optimistic version; an add-connection flow; validate, rotate and revoke actions with confirmation; and a warning that shared-connection lifecycle operations require tenant-level administration.

All sample values and interactions in the HTML preview are local mock state. They do not issue API requests, create secrets, or contact providers.

## API wiring map

| UI action | API contract | Required behavior |
|---|---|---|
| Load list | GET /customer/applications/{applicationId}/provider-connections | Fetch separately for each authorized application; do not infer application access from UI selection |
| Bind connection | POST /customer/applications/{applicationId}/provider-connections/{connectionId}/bind | Submit allowed capability IDs; server checks catalogue membership, role permission, assignment and CSRF |
| Validate | POST /customer/applications/{applicationId}/provider-connections/{connectionId}/validate | Show outcome; refresh safe connection state and validation history |
| Rotate | POST /customer/applications/{applicationId}/provider-connections/{connectionId}/rotate | Send expectedVersion; require opaque secret-manager reference in a future production secret workflow; force revalidation |
| Revoke | POST /customer/applications/{applicationId}/provider-connections/{connectionId}/revoke | Send expectedVersion; explain workflow impact; refresh state after server confirmation |

The current lifecycle endpoints are synthetic-only and disabled in production. The preview must not be represented as wired to these endpoints.

## Required production interaction rules

1. Resolve customer, actor, role grants and application assignments from the authenticated durable browser session. Never accept tenant, actor or role IDs from browser form fields as authority.
2. Re-check permissions on every request; hiding a button is not authorization.
3. Use same-origin CSRF protection for mutations and propagate server correlation IDs for support/audit traceability.
4. Render only safe read-model fields. Do not return or log credentials or secret references to the browser.
5. Use server-provided state and version. Do not optimistically claim validation, rotation or revocation succeeded before the API confirms it.
6. For a connection bound to more than one application, disable application-scoped rotate/revoke and explain that tenant-level provider administration is required.
7. A newly bound or rotated connection remains unavailable to workflows until validation succeeds. Failed validation suspends its binding and offers a controlled rebind/revalidation path.
8. Show inherited platform restrictions and disabled capabilities; Customer Admin cannot override Product Admin policy.
9. Audit all create, bind, validate, rotate and revoke attempts/outcomes server-side. UI telemetry is not a substitute for durable audit.
10. Use accessible status text, keyboard-operable controls, confirmation for destructive actions and the shared application toast center.

## Production completion dependencies

- A real Customer Admin frontend application and route integration do not yet exist in this repository branch.
- The current API read contract is application-scoped; a customer-wide summary needs a safe authorized aggregation endpoint or parallel per-application reads.
- The current create flow is not exposed as a Customer Admin endpoint in the documented route set; tenant-wide connection creation is deliberately denied pending a tenant-level provider-admin grant model.
- A secure secret-manager write/resolve implementation and real provider adapters are required before real credentials or live provider validation can be enabled.
- Shared-connection lifecycle operations require a tenant-wide authorization model and audited cross-application impact review.
- The preview is not production functionality and must not be counted as a completed API/UI/DB vertical slice.

## Acceptance tests for the wired UI

- User without provider.connection.read cannot load connection details.
- Actor assigned to application A cannot read or mutate application B's bindings.
- A connection secret is absent from API response, browser DOM, logs and audit payloads.
- Bind with a capability absent from the platform catalogue is rejected.
- Validation success activates only the exact application binding; failure suspends it.
- Stale expectedVersion rotation/revoke is rejected without state mutation.
- Application admin cannot rotate/revoke a connection shared by multiple applications.
- Revoked connection is read-only and unavailable to workflow action selection.
- UI refresh after every mutation reflects authoritative server state.
- Product Admin restrictions remain enforced when Customer Admin edits application bindings.