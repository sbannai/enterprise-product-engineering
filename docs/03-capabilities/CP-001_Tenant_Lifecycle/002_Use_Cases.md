# CP-001 Tenant Lifecycle Management
## 002 Use Cases

### Actors
- Platform Administrator
- Tenant Administrator
- Operations Engineer
- Billing Service

## UC-001 Create Tenant
Preconditions:
- Valid subscription
- Approved request

Main Flow:
1. Submit tenant request.
2. Validate details.
3. Approve request.
4. Provision resources.
5. Activate tenant.

Postconditions:
- Tenant status = Active

## UC-002 Suspend Tenant
- Authorized user suspends tenant.
- Access is disabled.
- Audit event is recorded.

## UC-003 Reactivate Tenant
- Validate subscription.
- Restore access.
- Record audit event.

## UC-004 Decommission Tenant
- Archive tenant data.
- Remove active access.
- Mark tenant as Decommissioned.

## Alternate Flows
- Provisioning failure
- Duplicate domain
- Subscription expired

## Traceability
FR-001, FR-002, FR-003
