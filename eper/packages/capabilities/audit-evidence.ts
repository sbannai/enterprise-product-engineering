import { createHash } from "node:crypto";

export interface AuditEvidence {
  id: string;
  tenantId: string;
  requirementId: string;
  action: string;
  principalId: string;
  correlationId: string;
  occurredAt: string;
  payload: unknown;
  integrityHash: string;
}

export interface AuditEvidenceStore {
  append(input: Omit<AuditEvidence, "integrityHash">): AuditEvidence;
  get(tenantId: string, id: string): AuditEvidence | undefined;
  listByRequirement(tenantId: string, requirementId: string): readonly AuditEvidence[];
  verify(entry: AuditEvidence): boolean;
}

export class InMemoryAuditEvidenceStore implements AuditEvidenceStore {
  private readonly entries = new Map<string, AuditEvidence>();

  private cloneEvidence(entry: AuditEvidence): AuditEvidence {
    return { ...entry, payload: JSON.parse(JSON.stringify(entry.payload)) };
  }

  private integrityMaterial(entry: Omit<AuditEvidence, "integrityHash">): string {
    const serializedPayload = JSON.stringify(entry.payload);
    if (serializedPayload === undefined) throw new Error("AUDIT_PAYLOAD_NOT_SERIALIZABLE");
    let payload: unknown;
    try {
      payload = JSON.parse(serializedPayload);
    } catch {
      throw new Error("AUDIT_PAYLOAD_NOT_SERIALIZABLE");
    }
    return JSON.stringify({
      id: entry.id,
      tenantId: entry.tenantId,
      requirementId: entry.requirementId,
      action: entry.action,
      principalId: entry.principalId,
      correlationId: entry.correlationId,
      occurredAt: entry.occurredAt,
      payload,
    });
  }

  private key(tenantId: string, id: string): string {
    return JSON.stringify([tenantId, id]);
  }

  append(input: Omit<AuditEvidence, "integrityHash">): AuditEvidence {
    if (!input.id || !input.tenantId || !input.requirementId || !input.principalId || !input.correlationId) {
      throw new Error("AUDIT_EVIDENCE_CONTEXT_REQUIRED");
    }
    if (!input.action || !input.occurredAt) {
      throw new Error("AUDIT_EVIDENCE_FIELDS_REQUIRED");
    }
    if (Number.isNaN(Date.parse(input.occurredAt))) {
      throw new Error("AUDIT_EVIDENCE_TIMESTAMP_INVALID");
    }
    const material = this.integrityMaterial(input);
    const clonedPayload = JSON.parse(JSON.stringify(input.payload)) as unknown;
    const integrityHash = createHash("sha256").update(material).digest("hex");
    const entry = { ...input, payload: clonedPayload, integrityHash };
    const key = this.key(input.tenantId, input.id);
    if (this.entries.has(key)) throw new Error("AUDIT_EVIDENCE_ALREADY_EXISTS");
    this.entries.set(key, entry);
    return this.cloneEvidence(entry);
  }

  get(tenantId: string, id: string): AuditEvidence | undefined {
    const entry = this.entries.get(this.key(tenantId, id));
    return entry ? this.cloneEvidence(entry) : undefined;
  }

  listByRequirement(tenantId: string, requirementId: string): readonly AuditEvidence[] {
    return [...this.entries.values()]
      .filter((entry) => entry.tenantId === tenantId && entry.requirementId === requirementId)
      .map((entry) => this.cloneEvidence(entry));
  }

  verify(entry: AuditEvidence): boolean {
    if (!entry || typeof entry.integrityHash !== "string" || !/^[a-f0-9]{64}$/.test(entry.integrityHash)) {
      return false;
    }
    try {
      const material = this.integrityMaterial(entry);
      const expected = createHash("sha256").update(material).digest("hex");
      return expected === entry.integrityHash;
    } catch {
      return false;
    }
  }
}
