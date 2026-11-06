// GENERATED EPER SOURCE — REQ-46405
// BRD-001-REQ-46405 | SRS-FR-2333 | Pattern XX05
// Source-generation baseline; bind approved contracts before execution.

export type ExceptionDisposition = "RETRY" | "COMPENSATE" | "RECONCILE" | "FAIL";

export const requirement = { id: "REQ-46405", brd: "BRD-001-REQ-46405", srs: "SRS-FR-2333", pattern: "XX05" } as const;

export function implementationBoundary(): string {
  return "exception-handling";
}
