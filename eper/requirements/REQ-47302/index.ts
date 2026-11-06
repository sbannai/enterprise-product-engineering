// GENERATED EPER SOURCE — REQ-47302
// BRD-001-REQ-47302 | SRS-FR-2384 | Pattern XX02
// Source-generation baseline; bind approved contracts before execution.

export interface AuthorizationDecision { allowed: boolean; reason?: string; }

export const requirement = { id: "REQ-47302", brd: "BRD-001-REQ-47302", srs: "SRS-FR-2384", pattern: "XX02" } as const;

export function implementationBoundary(): string {
  return "authorization";
}
