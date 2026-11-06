import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonFileAuditEvidenceStore } from "../dist/packages/capabilities/json-file-audit-evidence-store.js";
import { JsonFileGovernedReportingStore } from "../dist/packages/capabilities/json-file-governed-reporting-store.js";

test("audit evidence persists across adapter recreation and verifies integrity", () => {
  const dir=mkdtempSync(join(tmpdir(),"eper-audit-store-")); const path=join(dir,"audit.json");
  try {
    const first=new JsonFileAuditEvidenceStore(path);
    const entry=first.append({id:"audit-1",tenantId:"tenant-a",requirementId:"REQ-46304",action:"TEST",principalId:"user-1",correlationId:"corr-1",occurredAt:"2026-10-09T00:00:00.000Z",payload:{value:1}});
    const recreated=new JsonFileAuditEvidenceStore(path);
    assert.equal(recreated.get("tenant-a","audit-1")?.integrityHash,entry.integrityHash);
    assert.equal(recreated.verify(entry),true);
    assert.equal(recreated.get("tenant-b","audit-1"),undefined);
    assert.throws(()=>recreated.append({id:"audit-1",tenantId:"tenant-a",requirementId:"REQ-46304",action:"TEST",principalId:"user-1",correlationId:"corr-1",occurredAt:"2026-10-09T00:00:00.000Z",payload:{value:1}}),/AUDIT_EVIDENCE_ALREADY_EXISTS/);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
test("governed reports persist across adapter recreation and remain tenant scoped", () => {
  const dir=mkdtempSync(join(tmpdir(),"eper-report-store-")); const path=join(dir,"reports.json");
  try {
    const first=new JsonFileGovernedReportingStore(path);
    first.publish({tenantId:"tenant-a",reportId:"report-1",values:{status:"PASS"},sourceRequirementIds:["REQ-46301"],generatedAt:"2026-10-09T00:00:00.000Z"});
    first.publish({tenantId:"tenant-b",reportId:"report-1",values:{status:"FAIL"},sourceRequirementIds:["REQ-46302"],generatedAt:"2026-10-09T00:00:00.000Z"});
    const recreated=new JsonFileGovernedReportingStore(path);
    assert.equal(recreated.query({tenantId:"tenant-a",reportId:"report-1"}).length,1);
    assert.equal(recreated.query({tenantId:"tenant-a",reportId:"report-1",filters:{status:"PASS"}}).length,1);
    assert.equal(recreated.query({tenantId:"tenant-a",reportId:"report-1",filters:{status:"FAIL"}}).length,0);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
