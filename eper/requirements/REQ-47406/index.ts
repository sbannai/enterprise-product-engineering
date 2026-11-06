// GENERATED EPER SOURCE — REQ-47406
// BRD-001-REQ-47406 | SRS-FR-2394 | Pattern XX06
// Source-generation baseline; bind approved contracts before execution.

export interface ReportQuery { tenantId: string; filters?: Record<string, unknown>; cursor?: string; }

export const requirement = { id: "REQ-47406", brd: "BRD-001-REQ-47406", srs: "SRS-FR-2394", pattern: "XX06" } as const;

export function implementationBoundary(): string {
  return "governed-reporting";
}
