// GENERATED EPER SOURCE — REQ-47706
// BRD-001-REQ-47706 | SRS-FR-2412 | Pattern XX06
// Source-generation baseline; bind approved contracts before execution.

export interface ReportQuery { tenantId: string; filters?: Record<string, unknown>; cursor?: string; }

export const requirement = { id: "REQ-47706", brd: "BRD-001-REQ-47706", srs: "SRS-FR-2412", pattern: "XX06" } as const;

export function implementationBoundary(): string {
  return "governed-reporting";
}
