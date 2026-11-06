// GENERATED EPER SOURCE — REQ-48205
// BRD-001-REQ-48205 | SRS-FR-2441 | Pattern XX05
// Source-generation baseline; bind approved contracts before execution.

export type ExceptionDisposition = "RETRY" | "COMPENSATE" | "RECONCILE" | "FAIL";

export const requirement = { id: "REQ-48205", brd: "BRD-001-REQ-48205", srs: "SRS-FR-2441", pattern: "XX05" } as const;

export function implementationBoundary(): string {
  return "exception-handling";
}
