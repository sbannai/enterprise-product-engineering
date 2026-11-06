// GENERATED EPER SOURCE — REQ-46902
// BRD-001-REQ-46902 | SRS-FR-2360 | Pattern XX02
// Source-generation baseline; bind approved contracts before execution.

export interface AuthorizationDecision { allowed: boolean; reason?: string; }

export const requirement = { id: "REQ-46902", brd: "BRD-001-REQ-46902", srs: "SRS-FR-2360", pattern: "XX02" } as const;

export function implementationBoundary(): string {
  return "authorization";
}
