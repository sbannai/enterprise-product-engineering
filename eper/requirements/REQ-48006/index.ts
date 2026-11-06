// GENERATED EPER SOURCE — REQ-48006
// BRD-001-REQ-48006 | SRS-FR-2430 | Pattern XX06
// Source-generation baseline; bind approved contracts before execution.

export interface ReportQuery { tenantId: string; filters?: Record<string, unknown>; cursor?: string; }

export const requirement = { id: "REQ-48006", brd: "BRD-001-REQ-48006", srs: "SRS-FR-2430", pattern: "XX06" } as const;

export function implementationBoundary(): string {
  return "governed-reporting";
}
