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
}

export class InMemoryAuditEvidenceStore implements AuditEvidenceStore {
  private readonly entries = new Map<string, AuditEvidence>();

  private cloneEvidence(entry: AuditEvidence): AuditEvidence {
    return { ...entry, payload: JSON.parse(JSON.stringify(entry.payload)) };
  }

  private key(tenantId: string, id: string): string {
    return JSON.stringify([tenantId, id]);
  }

  append(input: Omit<AuditEvidence, "integrityHash">): AuditEvidence {
    if (!input.id || !input.tenantId || !input.requirementId || !input.principalId || !input.correlationId) {
      throw new Error("AUDIT_EVIDENCE_CONTEXT_REQUIRED");
    }
    const serializedPayload = JSON.stringify(input.payload);
    if (serializedPayload === undefined) throw new Error("AUDIT_PAYLOAD_NOT_SERIALIZABLE");
    let clonedPayload: unknown;
    try {
      clonedPayload = JSON.parse(serializedPayload);
    } catch {
      throw new Error("AUDIT_PAYLOAD_NOT_SERIALIZABLE");
    }
    const material = JSON.stringify({
      id: input.id,
      tenantId: input.tenantId,
      requirementId: input.requirementId,
      action: input.action,
      principalId: input.principalId,
      correlationId: input.correlationId,
      occurredAt: input.occurredAt,
      payload: clonedPayload,
    });
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
}
