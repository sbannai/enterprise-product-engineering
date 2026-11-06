// GENERATED EPER SOURCE — REQ-47606
// BRD-001-REQ-47606 | SRS-FR-2406 | Pattern XX06
// Source-generation baseline; bind approved contracts before execution.

export interface ReportQuery { tenantId: string; filters?: Record<string, unknown>; cursor?: string; }

export const requirement = { id: "REQ-47606", brd: "BRD-001-REQ-47606", srs: "SRS-FR-2406", pattern: "XX06" } as const;

export function implementationBoundary(): string {
  return "governed-reporting";
}
