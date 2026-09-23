// GENERATED EPER SOURCE — REQ-49306
// BRD-001-REQ-49306 | SRS-FR-2508 | Pattern XX06
// Source-generation baseline; bind approved contracts before execution.

export interface ReportQuery { tenantId: string; filters?: Record<string, unknown>; cursor?: string; }

export const requirement = { id: "REQ-49306", brd: "BRD-001-REQ-49306", srs: "SRS-FR-2508", pattern: "XX06" } as const;

export function implementationBoundary(): string {
  return "governed-reporting";
}
