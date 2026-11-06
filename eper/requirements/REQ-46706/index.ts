// GENERATED EPER SOURCE — REQ-46706
// BRD-001-REQ-46706 | SRS-FR-2352 | Pattern XX06
// Source-generation baseline; bind approved contracts before execution.

export interface ReportQuery { tenantId: string; filters?: Record<string, unknown>; cursor?: string; }

export const requirement = { id: "REQ-46706", brd: "BRD-001-REQ-46706", srs: "SRS-FR-2352", pattern: "XX06" } as const;

export function implementationBoundary(): string {
  return "governed-reporting";
}
