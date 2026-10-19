import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonFileGovernedReportingStore } from "../dist/packages/capabilities/json-file-governed-reporting-store.js";

function withStore(run) {
  const directory = mkdtempSync(join(tmpdir(), "eper-report-store-"));
  try { run(new JsonFileGovernedReportingStore(join(directory, "reports.json"))); }
  finally { rmSync(directory, { recursive: true, force: true }); }
}

const row = {
  tenantId: "tenant-a",
  reportId: "rpt-1",
  values: { status: "ACTIVE", nested: { labels: ["original"] } },
  sourceRequirementIds: ["REQ-46306"],
  generatedAt: "2026-09-23T15:00:00Z",
};

test("JSON reporting store validates required context, timestamps, values and provenance", () => {
  withStore(store => {
    assert.throws(() => store.publish(null), /REPORT_CONTEXT_REQUIRED/);
    assert.throws(() => store.publish({ ...row, generatedAt: "not-a-date" }), /REPORT_TIMESTAMP_INVALID/);
    assert.throws(() => store.publish({ ...row, values: [] }), /REPORT_VALUES_INVALID/);
    assert.throws(() => store.publish({ ...row, sourceRequirementIds: "REQ-46306" }), /REPORT_PROVENANCE_INVALID/);
    assert.throws(() => store.publish({ ...row, sourceRequirementIds: [" "] }), /REPORT_PROVENANCE_INVALID/);
    assert.throws(() => store.publish({ ...row, sourceRequirementIds: [] }), /REPORT_PROVENANCE_REQUIRED/);
    assert.equal(store.query({ tenantId: "tenant-a", reportId: "rpt-1" }).length, 0);
  });
});

test("JSON reporting store validates query context, filters and limit", () => {
  withStore(store => {
    store.publish(row);
    assert.throws(() => store.query(null), /REPORT_QUERY_CONTEXT_REQUIRED/);
    assert.throws(() => store.query({ tenantId: "", reportId: "rpt-1" }), /REPORT_QUERY_CONTEXT_REQUIRED/);
    assert.throws(() => store.query({ tenantId: "tenant-a", reportId: "rpt-1", filters: [] }), /REPORT_FILTERS_INVALID/);
    assert.throws(() => store.query({ tenantId: "tenant-a", reportId: "rpt-1", limit: 0 }), /REPORT_LIMIT_INVALID/);
    assert.equal(store.query({ tenantId: "tenant-a", reportId: "rpt-1", filters: { status: "MISSING" } }).length, 0);
  });
});

test("JSON reporting store isolates tenants and deep-clones published and returned rows", () => {
  withStore(store => {
    const input = structuredClone(row);
    store.publish(input);
    input.values.nested.labels.push("input-mutation");
    store.publish({ ...row, tenantId: "tenant-b" });
    const result = store.query({ tenantId: "tenant-a", reportId: "rpt-1" });
    assert.equal(result.length, 1);
    result[0].values.nested.labels.push("output-mutation");
    assert.deepEqual(store.query({ tenantId: "tenant-a", reportId: "rpt-1" })[0].values, {
      status: "ACTIVE", nested: { labels: ["original"] },
    });
    assert.equal(store.query({ tenantId: "tenant-b", reportId: "rpt-1" }).length, 1);
  });
});
