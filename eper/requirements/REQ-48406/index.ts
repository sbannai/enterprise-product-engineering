// GENERATED EPER SOURCE — REQ-48406
// BRD-001-REQ-48406 | SRS-FR-2454 | Pattern XX06
// Source-generation baseline; bind approved contracts before execution.

export interface ReportQuery { tenantId: string; filters?: Record<string, unknown>; cursor?: string; }

export const requirement = { id: "REQ-48406", brd: "BRD-001-REQ-48406", srs: "SRS-FR-2454", pattern: "XX06" } as const;

export function implementationBoundary(): string {
  return "governed-reporting";
}
