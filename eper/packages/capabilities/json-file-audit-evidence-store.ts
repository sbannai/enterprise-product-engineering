import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AuditEvidence, AuditEvidenceStore } from "./audit-evidence.js";

/** Local JSON-file adapter for isolated UAT. Not safe for concurrent multi-process writers. */
export class JsonFileAuditEvidenceStore implements AuditEvidenceStore {
  constructor(private readonly filePath: string) {
    if (!filePath?.trim()) throw new Error("PERSISTENCE_PATH_REQUIRED");
    mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
    try { readFileSync(filePath, "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; this.commit([]); }
  }
  private key(tenantId: string, id: string): string { return JSON.stringify([tenantId, id]); }
  private read(): AuditEvidence[] {
    try { const parsed: unknown = JSON.parse(readFileSync(this.filePath, "utf8")); if (!Array.isArray(parsed)) throw new Error(); return parsed as AuditEvidence[]; }
    catch { throw new Error("PERSISTENCE_DATA_INVALID"); }
  }
  private commit(entries: AuditEvidence[]): void {
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(entries), { encoding: "utf8", mode: 0o600, flag: "wx" });
    renameSync(temporary, this.filePath);
  }
  private material(entry: Omit<AuditEvidence, "integrityHash">): string {
    const serialized = JSON.stringify(entry.payload);
    if (serialized === undefined) throw new Error("AUDIT_PAYLOAD_NOT_SERIALIZABLE");
    const payload = JSON.parse(serialized);
    return JSON.stringify({ id: entry.id, tenantId: entry.tenantId, requirementId: entry.requirementId, action: entry.action, principalId: entry.principalId, correlationId: entry.correlationId, occurredAt: entry.occurredAt, payload });
  }
  append(input: Omit<AuditEvidence, "integrityHash">): AuditEvidence {
    if (!input.id || !input.tenantId || !input.requirementId || !input.principalId || !input.correlationId) throw new Error("AUDIT_EVIDENCE_CONTEXT_REQUIRED");
    if (!input.action || !input.occurredAt) throw new Error("AUDIT_EVIDENCE_FIELDS_REQUIRED");
    if (Number.isNaN(Date.parse(input.occurredAt))) throw new Error("AUDIT_EVIDENCE_TIMESTAMP_INVALID");
    const entries = this.read();
    if (entries.some(e => this.key(e.tenantId,e.id)===this.key(input.tenantId,input.id))) throw new Error("AUDIT_EVIDENCE_ALREADY_EXISTS");
    const integrityHash = createHash("sha256").update(this.material(input)).digest("hex");
    const entry = JSON.parse(JSON.stringify({ ...input, integrityHash })) as AuditEvidence;
    entries.push(entry); this.commit(entries);
    return JSON.parse(JSON.stringify(entry)) as AuditEvidence;
  }
  get(tenantId: string, id: string): AuditEvidence | undefined {
    const entry=this.read().find(e=>this.key(e.tenantId,e.id)===this.key(tenantId,id));
    return entry ? JSON.parse(JSON.stringify(entry)) as AuditEvidence : undefined;
  }
  listByRequirement(tenantId: string, requirementId: string): readonly AuditEvidence[] {
    return this.read().filter(e=>e.tenantId===tenantId&&e.requirementId===requirementId).map(e=>JSON.parse(JSON.stringify(e)) as AuditEvidence);
  }
  verify(entry: AuditEvidence): boolean {
    if (!entry || !/^[a-f0-9]{64}$/.test(entry.integrityHash||"")) return false;
    try { const { integrityHash, ...material }=entry; return createHash("sha256").update(this.material(material)).digest("hex")===integrityHash; }
    catch { return false; }
  }
}
