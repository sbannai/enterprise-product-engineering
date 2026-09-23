// GENERATED EPER SOURCE — REQ-47002
// BRD-001-REQ-47002 | SRS-FR-2366 | Pattern XX02
// Source-generation baseline; bind approved contracts before execution.

export interface AuthorizationDecision { allowed: boolean; reason?: string; }

export const requirement = { id: "REQ-47002", brd: "BRD-001-REQ-47002", srs: "SRS-FR-2366", pattern: "XX02" } as const;

export function implementationBoundary(): string {
  return "authorization";
}
