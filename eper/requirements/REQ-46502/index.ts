// GENERATED EPER SOURCE — REQ-46502
// BRD-001-REQ-46502 | SRS-FR-2336 | Pattern XX02
// Source-generation baseline; bind approved contracts before execution.

export interface AuthorizationDecision { allowed: boolean; reason?: string; }

export const requirement = { id: "REQ-46502", brd: "BRD-001-REQ-46502", srs: "SRS-FR-2336", pattern: "XX02" } as const;

export function implementationBoundary(): string {
  return "authorization";
}
