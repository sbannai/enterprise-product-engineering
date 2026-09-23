// GENERATED EPER SOURCE — REQ-46702
// BRD-001-REQ-46702 | SRS-FR-2348 | Pattern XX02
// Source-generation baseline; bind approved contracts before execution.

export interface AuthorizationDecision { allowed: boolean; reason?: string; }

export const requirement = { id: "REQ-46702", brd: "BRD-001-REQ-46702", srs: "SRS-FR-2348", pattern: "XX02" } as const;

export function implementationBoundary(): string {
  return "authorization";
}
