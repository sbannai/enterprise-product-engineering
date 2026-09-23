// GENERATED EPER SOURCE — REQ-47506
// BRD-001-REQ-47506 | SRS-FR-2400 | Pattern XX06
// Source-generation baseline; bind approved contracts before execution.

export interface ReportQuery { tenantId: string; filters?: Record<string, unknown>; cursor?: string; }

export const requirement = { id: "REQ-47506", brd: "BRD-001-REQ-47506", srs: "SRS-FR-2400", pattern: "XX06" } as const;

export function implementationBoundary(): string {
  return "governed-reporting";
}
