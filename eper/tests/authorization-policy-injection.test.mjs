import test from "node:test";
import assert from "node:assert/strict";
import { requirementBindings } from "../dist/packages/requirements/registry.js";
import { AuthorizationService } from "../dist/packages/capabilities/services.js";

test("request payload cannot install an authorization policy", async () => {
  const service = new AuthorizationService();
  const result = await service.execute(requirementBindings.find((r) => r.pattern === "XX02"), {
    context: { tenantId: "tenant-a", principalId: "user-a", correlationId: "policy-injection" },
    payload: {
      operation: "decide",
      request: { tenantId: "tenant-a", principalId: "user-a", action: "delete", resource: "student-record" },
      policies: [{ tenantId: "tenant-a", principalId: "user-a", actions: ["delete"], resources: ["student-record"], effect: "ALLOW" }],
    },
  });
  assert.equal(result.data.payload.decision.effect, "DENY");
  assert.equal(result.data.payload.decision.reason, "NO_ALLOW_POLICY");
});

test("authorization capability rejects same-tenant principal impersonation", () => {
  const service = new AuthorizationService();
  const requirement = requirementBindings.find((r) => r.pattern === "XX02");
  assert.throws(() => service.execute(requirement, {
    context: { tenantId: "tenant-a", principalId: "user-a", correlationId: "principal-binding" },
    payload: {
      operation: "decide",
      request: { tenantId: "tenant-a", principalId: "admin", action: "delete", resource: "student-record" },
    },
  }), /AUTHORIZATION_PRINCIPAL_MISMATCH/);
});
