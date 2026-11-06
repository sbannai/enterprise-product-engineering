// GENERATED EPER SOURCE — REQ-46605
// BRD-001-REQ-46605 | SRS-FR-2345 | Pattern XX05
// Source-generation baseline; bind approved contracts before execution.

export type ExceptionDisposition = "RETRY" | "COMPENSATE" | "RECONCILE" | "FAIL";

export const requirement = { id: "REQ-46605", brd: "BRD-001-REQ-46605", srs: "SRS-FR-2345", pattern: "XX05" } as const;

export function implementationBoundary(): string {
  return "exception-handling";
}
