// GENERATED EPER SOURCE — REQ-48602
// BRD-001-REQ-48602 | SRS-FR-2462 | Pattern XX02
// Source-generation baseline; bind approved contracts before execution.

export interface AuthorizationDecision { allowed: boolean; reason?: string; }

export const requirement = { id: "REQ-48602", brd: "BRD-001-REQ-48602", srs: "SRS-FR-2462", pattern: "XX02" } as const;

export function implementationBoundary(): string {
  return "authorization";
}
