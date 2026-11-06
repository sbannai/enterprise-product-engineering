// GENERATED EPER SOURCE — REQ-50002
// BRD-001-REQ-50002 | SRS-FR-2546 | Pattern XX02
// Source-generation baseline; bind approved contracts before execution.

export interface AuthorizationDecision { allowed: boolean; reason?: string; }

export const requirement = { id: "REQ-50002", brd: "BRD-001-REQ-50002", srs: "SRS-FR-2546", pattern: "XX02" } as const;

export function implementationBoundary(): string {
  return "authorization";
}
