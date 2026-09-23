// GENERATED EPER SOURCE — REQ-48106
// BRD-001-REQ-48106 | SRS-FR-2436 | Pattern XX06
// Source-generation baseline; bind approved contracts before execution.

export interface ReportQuery { tenantId: string; filters?: Record<string, unknown>; cursor?: string; }

export const requirement = { id: "REQ-48106", brd: "BRD-001-REQ-48106", srs: "SRS-FR-2436", pattern: "XX06" } as const;

export function implementationBoundary(): string {
  return "governed-reporting";
}
