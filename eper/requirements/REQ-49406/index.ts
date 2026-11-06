// GENERATED EPER SOURCE — REQ-49406
// BRD-001-REQ-49406 | SRS-FR-2514 | Pattern XX06
// Source-generation baseline; bind approved contracts before execution.

export interface ReportQuery { tenantId: string; filters?: Record<string, unknown>; cursor?: string; }

export const requirement = { id: "REQ-49406", brd: "BRD-001-REQ-49406", srs: "SRS-FR-2514", pattern: "XX06" } as const;

export function implementationBoundary(): string {
  return "governed-reporting";
}
