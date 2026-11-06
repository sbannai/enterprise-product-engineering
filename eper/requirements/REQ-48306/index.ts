// GENERATED EPER SOURCE — REQ-48306
// BRD-001-REQ-48306 | SRS-FR-2448 | Pattern XX06
// Source-generation baseline; bind approved contracts before execution.

export interface ReportQuery { tenantId: string; filters?: Record<string, unknown>; cursor?: string; }

export const requirement = { id: "REQ-48306", brd: "BRD-001-REQ-48306", srs: "SRS-FR-2448", pattern: "XX06" } as const;

export function implementationBoundary(): string {
  return "governed-reporting";
}
