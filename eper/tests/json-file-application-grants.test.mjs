import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  JsonFileApplicationGrantStore,
  JsonLinesPermissionAuditSink,
} from "../dist/packages/tenant/json-file-application-grants.js";

const scope = { tenantId: "tenant-a", applicationId: "app-a", environment: "uat" };
const grant = {
  ...scope,
  principalId: "user-a",
  actions: ["run:read", "receipt:download"],
  effect: "ALLOW",
  active: true,
};

test("JSON grant store survives re-instantiation and replaces only the exact scope", () => {
  const directory = mkdtempSync(join(tmpdir(), "eper-grants-"));
  try {
    const file = join(directory, "grants.json");
    const first = new JsonFileApplicationGrantStore(file);
    first.replaceForPrincipal(scope, "user-a", [grant]);
    first.replaceForPrincipal({ ...scope, environment: "production" }, "user-a", [{
      ...grant, environment: "production", actions: ["kpi:read"],
    }]);

    const reloaded = new JsonFileApplicationGrantStore(file);
    assert.equal(reloaded.list().length, 2);
    assert.deepEqual(reloaded.list().find((item) => item.environment === "uat")?.actions, ["run:read", "receipt:download"]);
    reloaded.replaceForPrincipal(scope, "user-a", []);
    assert.equal(reloaded.list().length, 1);
    assert.equal(reloaded.list()[0].environment, "production");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("JSON-lines permission audit appends events without overwriting prior entries", () => {
  const directory = mkdtempSync(join(tmpdir(), "eper-audit-"));
  try {
    const file = join(directory, "permission-audit.jsonl");
    const sink = new JsonLinesPermissionAuditSink(file);
    sink.append({ eventId: "e1", occurredAt: "2026-10-22T09:00:00.000Z", actorPrincipalId: "admin-a",
      targetPrincipalId: "user-a", tenantId: "tenant-a", applicationId: "app-a", environment: "uat",
      action: "permission.grants.replaced", grantCount: 1 });
    sink.append({ eventId: "e2", occurredAt: "2026-10-22T09:01:00.000Z", actorPrincipalId: "admin-a",
      targetPrincipalId: "user-a", tenantId: "tenant-a", applicationId: "app-a", environment: "uat",
      action: "permission.grants.replaced", grantCount: 2 });

    const lines = readFileSync(file, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(lines.map((event) => event.eventId), ["e1", "e2"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
