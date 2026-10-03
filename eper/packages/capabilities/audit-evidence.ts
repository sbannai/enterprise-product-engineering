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

  private key(tenantId: string, id: string): string {
    return `${tenantId}:${id}`;
  }

  append(input: Omit<AuditEvidence, "integrityHash">): AuditEvidence {
    if (!input.id || !input.tenantId || !input.requirementId || !input.principalId || !input.correlationId) {
      throw new Error("AUDIT_EVIDENCE_CONTEXT_REQUIRED");
    }
    const material = JSON.stringify({
      id: input.id,
      tenantId: input.tenantId,
      requirementId: input.requirementId,
      action: input.action,
      principalId: input.principalId,
      correlationId: input.correlationId,
      occurredAt: input.occurredAt,
      payload: input.payload,
    });
    const integrityHash = createHash("sha256").update(material).digest("hex");
    const entry = { ...input, integrityHash };
    const key = this.key(input.tenantId, input.id);
    if (this.entries.has(key)) throw new Error("AUDIT_EVIDENCE_ALREADY_EXISTS");
    this.entries.set(key, entry);
    return { ...entry };
  }

  get(tenantId: string, id: string): AuditEvidence | undefined {
    const entry = this.entries.get(this.key(tenantId, id));
    return entry ? { ...entry } : undefined;
  }

  listByRequirement(tenantId: string, requirementId: string): readonly AuditEvidence[] {
    return [...this.entries.values()]
      .filter((entry) => entry.tenantId === tenantId && entry.requirementId === requirementId)
      .map((entry) => ({ ...entry }));
  }
}
