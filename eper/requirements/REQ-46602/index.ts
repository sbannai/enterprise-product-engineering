// GENERATED EPER SOURCE — REQ-46602
// BRD-001-REQ-46602 | SRS-FR-2342 | Pattern XX02
// Source-generation baseline; bind approved contracts before execution.

export interface AuthorizationDecision { allowed: boolean; reason?: string; }

export const requirement = { id: "REQ-46602", brd: "BRD-001-REQ-46602", srs: "SRS-FR-2342", pattern: "XX02" } as const;

export function implementationBoundary(): string {
  return "authorization";
}
