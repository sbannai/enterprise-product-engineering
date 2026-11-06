// GENERATED EPER SOURCE — REQ-49606
// BRD-001-REQ-49606 | SRS-FR-2526 | Pattern XX06
// Source-generation baseline; bind approved contracts before execution.

export interface ReportQuery { tenantId: string; filters?: Record<string, unknown>; cursor?: string; }

export const requirement = { id: "REQ-49606", brd: "BRD-001-REQ-49606", srs: "SRS-FR-2526", pattern: "XX06" } as const;

export function implementationBoundary(): string {
  return "governed-reporting";
}
