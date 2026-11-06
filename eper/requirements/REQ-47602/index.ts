// GENERATED EPER SOURCE — REQ-47602
// BRD-001-REQ-47602 | SRS-FR-2402 | Pattern XX02
// Source-generation baseline; bind approved contracts before execution.

export interface AuthorizationDecision { allowed: boolean; reason?: string; }

export const requirement = { id: "REQ-47602", brd: "BRD-001-REQ-47602", srs: "SRS-FR-2402", pattern: "XX02" } as const;

export function implementationBoundary(): string {
  return "authorization";
}
