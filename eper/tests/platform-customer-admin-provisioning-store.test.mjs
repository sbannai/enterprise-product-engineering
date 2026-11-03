import test from "node:test";
import assert from "node:assert/strict";
import { PostgresPlatformCustomerAdminProvisioningStore } from "../dist/packages/workflows/postgres-platform-customer-admin-provisioning-store.js";

const valid = {
  principal: {
    platformActorId: "platform-operator-01",
    permissions: ["customer_admin:provision", "customer_admin:recover"],
    credentialId: "platform-credential-01",
  },
  tenantId: "tenant-01",
  applicationId: "application-01",
  targetActorId: "customer-admin-01",
  idempotencyKey: "request-key-01",
  correlationId: "correlation-01",
  environment: "sandbox",
};

function unusedPool() {
  return { async connect() { throw new Error("DATABASE_SHOULD_NOT_BE_TOUCHED"); } };
}

test("platform provisioning rejects principals without the exact operation permission before DB access", async () => {
  const store = new PostgresPlatformCustomerAdminProvisioningStore(unusedPool());
  await assert.rejects(
    store.mutate({ ...valid, principal: { ...valid.principal, permissions: ["customer_admin:recover"] }, operation: "provision" }),
    /PLATFORM_CUSTOMER_ADMIN_PERMISSION_DENIED/,
  );
  await assert.rejects(
    store.mutate({ ...valid, principal: { ...valid.principal, permissions: ["customer_admin:provision"] }, operation: "recover", reasonTicketReference: "INC-1" }),
    /PLATFORM_CUSTOMER_ADMIN_PERMISSION_DENIED/,
  );
});

test("platform recovery requires a reason or ticket reference before DB access", async () => {
  const store = new PostgresPlatformCustomerAdminProvisioningStore(unusedPool());
  await assert.rejects(
    store.mutate({ ...valid, operation: "recover" }),
    /PLATFORM_CUSTOMER_ADMIN_RECOVERY_REASON_REQUIRED/,
  );
  await assert.rejects(
    store.mutate({ ...valid, operation: "recover", reasonTicketReference: " " }),
    /PLATFORM_CUSTOMER_ADMIN_RECOVERY_REASON_REQUIRED/,
  );
});

test("platform provisioning validates trusted principal and bounded idempotency inputs", async () => {
  const store = new PostgresPlatformCustomerAdminProvisioningStore(unusedPool());
  await assert.rejects(
    store.mutate({ ...valid, operation: "provision", principal: { ...valid.principal, platformActorId: " " } }),
    /PLATFORM_CUSTOMER_ADMIN_INVALID_PLATFORMACTORID/,
  );
  await assert.rejects(
    store.mutate({ ...valid, operation: "provision", idempotencyKey: " " }),
    /PLATFORM_CUSTOMER_ADMIN_INVALID_IDEMPOTENCYKEY/,
  );
});
