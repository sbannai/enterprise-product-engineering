// GENERATED EPER SOURCE — REQ-46402
// BRD-001-REQ-46402 | SRS-FR-2330 | Pattern XX02
// Source-generation baseline; bind approved contracts before execution.

export interface AuthorizationDecision { allowed: boolean; reason?: string; }

export const requirement = { id: "REQ-46402", brd: "BRD-001-REQ-46402", srs: "SRS-FR-2330", pattern: "XX02" } as const;

export function implementationBoundary(): string {
  return "authorization";
}
