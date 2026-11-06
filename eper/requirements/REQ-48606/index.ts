// GENERATED EPER SOURCE — REQ-48606
// BRD-001-REQ-48606 | SRS-FR-2466 | Pattern XX06
// Source-generation baseline; bind approved contracts before execution.

export interface ReportQuery { tenantId: string; filters?: Record<string, unknown>; cursor?: string; }

export const requirement = { id: "REQ-48606", brd: "BRD-001-REQ-48606", srs: "SRS-FR-2466", pattern: "XX06" } as const;

export function implementationBoundary(): string {
  return "governed-reporting";
}
