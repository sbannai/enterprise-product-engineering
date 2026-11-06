// GENERATED EPER SOURCE — REQ-47202
// BRD-001-REQ-47202 | SRS-FR-2378 | Pattern XX02
// Source-generation baseline; bind approved contracts before execution.

export interface AuthorizationDecision { allowed: boolean; reason?: string; }

export const requirement = { id: "REQ-47202", brd: "BRD-001-REQ-47202", srs: "SRS-FR-2378", pattern: "XX02" } as const;

export function implementationBoundary(): string {
  return "authorization";
}
