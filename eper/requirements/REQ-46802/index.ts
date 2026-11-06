// GENERATED EPER SOURCE — REQ-46802
// BRD-001-REQ-46802 | SRS-FR-2354 | Pattern XX02
// Source-generation baseline; bind approved contracts before execution.

export interface AuthorizationDecision { allowed: boolean; reason?: string; }

export const requirement = { id: "REQ-46802", brd: "BRD-001-REQ-46802", srs: "SRS-FR-2354", pattern: "XX02" } as const;

export function implementationBoundary(): string {
  return "authorization";
}
