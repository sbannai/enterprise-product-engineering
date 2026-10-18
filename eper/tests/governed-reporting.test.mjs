import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonFileGovernedReportingStore } from "../dist/packages/capabilities/json-file-governed-reporting-store.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonFileGovernedReportingStore } from "../dist/packages/capabilities/json-file-governed-reporting-store.js";
import { InMemoryGovernedReportingService } from "../dist/packages/capabilities/governed-reporting.js";

const serviceRow = {
  tenantId: "tenant-a",
  reportId: "rpt-1",
  values: { status: "ACTIVE", count: 10 },
  sourceRequirementIds: ["REQ-46306"],
  generatedAt: "2026-09-23T15:00:00Z",
};

test("governed reporting requires provenance", () => {
  const service = new InMemoryGovernedReportingService();
  service.publish(serviceRow);

  assert.equal(service.query({ tenantId: "tenant-a", reportId: "rpt-1" }).length, 1);
  assert.throws(
    () => service.publish({ ...serviceRow, reportId: "rpt-2", sourceRequirementIds: [] }),
    /REPORT_PROVENANCE_REQUIRED/,
  );
});

test("governed reporting isolates tenants and supports filters", () => {
  const service = new InMemoryGovernedReportingService();
  service.publish(serviceRow);
  service.publish({ ...serviceRow, tenantId: "tenant-b", values: { status: "ACTIVE", count: 99 } });

  assert.equal(service.query({ tenantId: "tenant-a", reportId: "rpt-1", filters: { status: "ACTIVE" } })[0].values.count, 10);
  assert.equal(service.query({ tenantId: "tenant-a", reportId: "rpt-1", filters: { status: "MISSING" } }).length, 0);
});

test("governed reporting validates query context and limit", () => {
  const service = new InMemoryGovernedReportingService();
  assert.throws(
    () => service.query({ tenantId: "", reportId: "rpt-1" }),
    /REPORT_QUERY_CONTEXT_REQUIRED/,
  );
  assert.throws(
    () => service.query({ tenantId: "tenant-a", reportId: "rpt-1", limit: 0 }),
    /REPORT_LIMIT_INVALID/,
  );
});

test("governed reports isolate nested input and returned values", () => {
  const service = new InMemoryGovernedReportingService();
  const row = {
    ...serviceRow,
    values: { nested: { labels: ["original"] } },
  };
  service.publish(row);
  row.values.nested.labels.push("caller-change");
  const result = service.query({ tenantId: "tenant-a", reportId: "rpt-1" });
  result[0].values.nested.labels.push("returned-change");
  assert.deepEqual(service.query({ tenantId: "tenant-a", reportId: "rpt-1" })[0].values, { nested: { labels: ["original"] } });
});

test("governed reports reject circular values", () => {
  const service = new InMemoryGovernedReportingService();
  const circular = {};
  circular.self = circular;
  assert.throws(() => service.publish({ ...serviceRow, values: circular }), /REPORT_DATA_NOT_SERIALIZABLE/);
});


test("governed reporting rejects malformed row shapes before storage", () => {
  const service = new InMemoryGovernedReportingService();
  assert.throws(() => service.publish(null), /REPORT_CONTEXT_REQUIRED/);
  assert.throws(() => service.publish({ ...serviceRow, generatedAt: "not-a-date" }), /REPORT_TIMESTAMP_INVALID/);
  assert.throws(() => service.publish({ ...serviceRow, sourceRequirementIds: [" "] }), /REPORT_PROVENANCE_REQUIRED/);
  assert.throws(() => service.publish({ ...serviceRow, values: [] }), /REPORT_VALUES_INVALID/);
  assert.throws(() => service.publish({ ...serviceRow, values: { bad: 1n } }), /REPORT_DATA_NOT_SERIALIZABLE/);
  assert.equal(service.query({ tenantId: "tenant-a", reportId: "rpt-1" }).length, 0);
});

test("governed reporting rejects malformed query and filter inputs", () => {
  const service = new InMemoryGovernedReportingService();
  assert.throws(() => service.query(null), /REPORT_QUERY_CONTEXT_REQUIRED/);
  assert.throws(() => service.query({ tenantId: "tenant-a", reportId: "rpt-1", filters: [] }), /REPORT_FILTERS_INVALID/);
  assert.throws(() => service.query({ tenantId: "tenant-a", reportId: "rpt-1", limit: Number.MAX_SAFE_INTEGER + 1 }), /REPORT_LIMIT_INVALID/);
});


test("JSON-file governed reporting enforces the same row and query guards", () => {
  const directory = mkdtempSync(join(tmpdir(), "eper-reporting-"));
  try {
    const store = new JsonFileGovernedReportingStore(join(directory, "reports.json"));
    assert.throws(() => store.publish(null), /REPORT_CONTEXT_REQUIRED/);
    assert.throws(() => store.publish({ ...serviceRow, generatedAt: "not-a-date" }), /REPORT_TIMESTAMP_INVALID/);
    assert.throws(() => store.publish({ ...serviceRow, sourceRequirementIds: [" "] }), /REPORT_PROVENANCE_REQUIRED/);
    assert.throws(() => store.publish({ ...serviceRow, values: [] }), /REPORT_VALUES_INVALID/);
    assert.throws(() => store.query(null), /REPORT_QUERY_CONTEXT_REQUIRED/);
    assert.throws(() => store.query({ tenantId: "tenant-a", reportId: "rpt-1", filters: [] }), /REPORT_FILTERS_INVALID/);
    assert.throws(() => store.query({ tenantId: "tenant-a", reportId: "rpt-1", limit: Number.MAX_SAFE_INTEGER + 1 }), /REPORT_LIMIT_INVALID/);
    assert.equal(store.query({ tenantId: "tenant-a", reportId: "rpt-1" }).length, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});


test("JSON-file reporting rejects malformed persisted rows on query", () => {
  const directory = mkdtempSync(join(tmpdir(), "eper-reporting-corrupt-"));
  const file = join(directory, "reports.json");
  try {
    const store = new JsonFileGovernedReportingStore(file);
    store.publish(serviceRow);
    const rows = JSON.parse(readFileSync(file, "utf8"));
    rows[0].sourceRequirementIds = [" "];
    writeFileSync(file, JSON.stringify(rows));
    assert.throws(() => store.query({ tenantId: "tenant-a", reportId: "rpt-1" }), /PERSISTENCE_DATA_INVALID/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("JSON-file reporting rejects duplicate tenant/report/source row identities", () => {
  const directory = mkdtempSync(join(tmpdir(), "eper-reporting-duplicates-"));
  const file = join(directory, "reports.json");
  try {
    const store = new JsonFileGovernedReportingStore(file);
    store.publish(serviceRow);
    store.publish({ ...serviceRow, values: { metric: 2 } });
    assert.equal(store.query({ tenantId: "tenant-a", reportId: "rpt-1" }).length, 2);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
