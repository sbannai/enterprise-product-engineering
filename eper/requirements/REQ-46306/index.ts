// GENERATED EPER SOURCE — REQ-46306
// BRD-001-REQ-46306 | SRS-FR-2328 | Pattern XX06
// Source-generation baseline; bind approved contracts before execution.

export interface ReportQuery { tenantId: string; filters?: Record<string, unknown>; cursor?: string; }

export const requirement = { id: "REQ-46306", brd: "BRD-001-REQ-46306", srs: "SRS-FR-2328", pattern: "XX06" } as const;

export function implementationBoundary(): string {
  return "governed-reporting";
}
