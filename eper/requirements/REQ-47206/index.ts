// GENERATED EPER SOURCE — REQ-47206
// BRD-001-REQ-47206 | SRS-FR-2382 | Pattern XX06
// Source-generation baseline; bind approved contracts before execution.

export interface ReportQuery { tenantId: string; filters?: Record<string, unknown>; cursor?: string; }

export const requirement = { id: "REQ-47206", brd: "BRD-001-REQ-47206", srs: "SRS-FR-2382", pattern: "XX06" } as const;

export function implementationBoundary(): string {
  return "governed-reporting";
}
