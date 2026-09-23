// GENERATED EPER SOURCE — REQ-49106
// BRD-001-REQ-49106 | SRS-FR-2496 | Pattern XX06
// Source-generation baseline; bind approved contracts before execution.

export interface ReportQuery { tenantId: string; filters?: Record<string, unknown>; cursor?: string; }

export const requirement = { id: "REQ-49106", brd: "BRD-001-REQ-49106", srs: "SRS-FR-2496", pattern: "XX06" } as const;

export function implementationBoundary(): string {
  return "governed-reporting";
}
