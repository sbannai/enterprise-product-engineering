// GENERATED EPER SOURCE — REQ-49506
// BRD-001-REQ-49506 | SRS-FR-2520 | Pattern XX06
// Source-generation baseline; bind approved contracts before execution.

export interface ReportQuery { tenantId: string; filters?: Record<string, unknown>; cursor?: string; }

export const requirement = { id: "REQ-49506", brd: "BRD-001-REQ-49506", srs: "SRS-FR-2520", pattern: "XX06" } as const;

export function implementationBoundary(): string {
  return "governed-reporting";
}
