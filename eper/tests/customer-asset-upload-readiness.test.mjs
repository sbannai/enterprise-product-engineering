import test from "node:test";
import assert from "node:assert/strict";
import { createAppServer } from "../dist/apps/api/server.js";

test("upload API startup fails closed unless durable identity, role, asset and audit dependencies are wired", () => {
  const keys = [
    "EPER_CUSTOMER_ASSET_UPLOAD_API_ENABLED",
    "EPER_CUSTOMER_ASSET_PERSISTENCE",
    "EPER_CUSTOMER_IDENTITY_PERSISTENCE",
    "EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE",
    "EPER_AUDIT_PERSISTENCE",
  ];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.EPER_CUSTOMER_ASSET_UPLOAD_API_ENABLED = "true";
  process.env.EPER_CUSTOMER_ASSET_PERSISTENCE = "postgres";
  process.env.EPER_CUSTOMER_IDENTITY_PERSISTENCE = "postgres";
  process.env.EPER_CUSTOMER_ACTOR_ASSIGNMENT_PERSISTENCE = "postgres";
  process.env.EPER_AUDIT_PERSISTENCE = "postgres";
  try {
    assert.throws(
      () => createAppServer({}),
      /CUSTOMER_ASSET_UPLOAD_REQUIRES_DURABLE_IDENTITY_ROLE_ASSET_AND_AUDIT_STORES/,
    );
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
