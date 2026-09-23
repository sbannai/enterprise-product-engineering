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
    if (this.entries.has(input.id)) throw new Error("AUDIT_EVIDENCE_ALREADY_EXISTS");
    this.entries.set(input.id, entry);
    return { ...entry };
  }

  get(tenantId: string, id: string): AuditEvidence | undefined {
    const entry = this.entries.get(id);
    if (!entry || entry.tenantId !== tenantId) return undefined;
    return { ...entry };
  }

  listByRequirement(tenantId: string, requirementId: string): readonly AuditEvidence[] {
    return [...this.entries.values()]
      .filter((entry) => entry.tenantId === tenantId && entry.requirementId === requirementId)
      .map((entry) => ({ ...entry }));
  }
}
