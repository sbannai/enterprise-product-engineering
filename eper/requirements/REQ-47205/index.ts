// GENERATED EPER SOURCE — REQ-47205
// BRD-001-REQ-47205 | SRS-FR-2381 | Pattern XX05
// Source-generation baseline; bind approved contracts before execution.

export type ExceptionDisposition = "RETRY" | "COMPENSATE" | "RECONCILE" | "FAIL";

export const requirement = { id: "REQ-47205", brd: "BRD-001-REQ-47205", srs: "SRS-FR-2381", pattern: "XX05" } as const;

export function implementationBoundary(): string {
  return "exception-handling";
}
