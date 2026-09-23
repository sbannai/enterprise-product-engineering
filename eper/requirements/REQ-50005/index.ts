// GENERATED EPER SOURCE — REQ-50005
// BRD-001-REQ-50005 | SRS-FR-2549 | Pattern XX05
// Source-generation baseline; bind approved contracts before execution.

export type ExceptionDisposition = "RETRY" | "COMPENSATE" | "RECONCILE" | "FAIL";

export const requirement = { id: "REQ-50005", brd: "BRD-001-REQ-50005", srs: "SRS-FR-2549", pattern: "XX05" } as const;

export function implementationBoundary(): string {
  return "exception-handling";
}
