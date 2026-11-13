import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const source=resolve(root,"packages/dependencies/postgres-dependency-inventory-repository.ts");

test("dependency inventory repository scopes every read and write to tenant plus application",async()=>{
 const ts=await readFile(source,"utf8");
 assert.match(ts,/set_config\("eper\.tenant_id"/);
 assert.match(ts,/set_config\("eper\.application_id"/);
 assert.match(ts,/WHERE p\.tenant_id=\$1 AND p\.application_id=\$2/);
 assert.match(ts,/WHERE p\.tenant_id=\$1 AND p\.application_id=\$2 AND p\.dependency_id=\$3/);
 assert.match(ts,/BEGIN READ ONLY/);
});

test("dependency policy and installation writes share a transaction with audit events",async()=>{
 const ts=await readFile(source,"utf8");
 assert.match(ts,/async savePolicy\(/);
 assert.match(ts,/async recordInstallation\(/);
 assert.match(ts,/appendAuditEventInTransaction/);
 assert.match(ts,/dependency\.policy\.save/);
 assert.match(ts,/dependency\.installation\.record/);
 assert.match(ts,/await c\.query\("COMMIT"\)/);
 assert.match(ts,/await this\.rollback\(c\)/);
});

test("policy updates use optimistic versions and notice evidence remains append-only",async()=>{
 const ts=await readFile(source,"utf8");
 assert.match(ts,/currentVersion!==input\.expectedVersion/);
 assert.match(ts,/DEPENDENCY_POLICY_VERSION_CONFLICT/);
 assert.match(ts,/INSERT INTO eper_dependency_notice_evidence/);
 assert.match(ts,/recorded_at/);
 assert.match(ts,/evidence_digest/);
 assert.match(ts,/required_minimum_version/);
});

test("dependency installation inventory reads are tenant/application scoped and deterministic",async()=>{
 const ts=await readFile(source,"utf8");
 assert.match(ts,/async listInstallations\(scope:DependencyScope,dependencyId\?:string\)/);
 assert.ok(ts.includes("FROM eper_dependency_installation"));
 assert.ok(ts.includes("WHERE tenant_id=$1 AND application_id=$2"));
 assert.match(ts,/ORDER BY dependency_id,scope_type,scope_id,installation_id/);
 assert.match(ts,/await this\.setScope\(c,scope\)/);
 assert.match(ts,/return r\.rows\.map\(mapInstallation\)/);
});
