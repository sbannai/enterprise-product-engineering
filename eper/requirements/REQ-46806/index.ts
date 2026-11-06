// GENERATED EPER SOURCE — REQ-46806
// BRD-001-REQ-46806 | SRS-FR-2358 | Pattern XX06
// Source-generation baseline; bind approved contracts before execution.

export interface ReportQuery { tenantId: string; filters?: Record<string, unknown>; cursor?: string; }

export const requirement = { id: "REQ-46806", brd: "BRD-001-REQ-46806", srs: "SRS-FR-2358", pattern: "XX06" } as const;

export function implementationBoundary(): string {
  return "governed-reporting";
}
