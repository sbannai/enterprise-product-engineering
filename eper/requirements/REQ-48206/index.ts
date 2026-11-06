// GENERATED EPER SOURCE — REQ-48206
// BRD-001-REQ-48206 | SRS-FR-2442 | Pattern XX06
// Source-generation baseline; bind approved contracts before execution.

export interface ReportQuery { tenantId: string; filters?: Record<string, unknown>; cursor?: string; }

export const requirement = { id: "REQ-48206", brd: "BRD-001-REQ-48206", srs: "SRS-FR-2442", pattern: "XX06" } as const;

export function implementationBoundary(): string {
  return "governed-reporting";
}
