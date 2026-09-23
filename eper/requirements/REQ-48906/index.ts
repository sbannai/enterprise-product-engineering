// GENERATED EPER SOURCE — REQ-48906
// BRD-001-REQ-48906 | SRS-FR-2484 | Pattern XX06
// Source-generation baseline; bind approved contracts before execution.

export interface ReportQuery { tenantId: string; filters?: Record<string, unknown>; cursor?: string; }

export const requirement = { id: "REQ-48906", brd: "BRD-001-REQ-48906", srs: "SRS-FR-2484", pattern: "XX06" } as const;

export function implementationBoundary(): string {
  return "governed-reporting";
}
