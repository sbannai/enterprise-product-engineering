// GENERATED EPER SOURCE — REQ-47405
// BRD-001-REQ-47405 | SRS-FR-2393 | Pattern XX05
// Source-generation baseline; bind approved contracts before execution.

export type ExceptionDisposition = "RETRY" | "COMPENSATE" | "RECONCILE" | "FAIL";

export const requirement = { id: "REQ-47405", brd: "BRD-001-REQ-47405", srs: "SRS-FR-2393", pattern: "XX05" } as const;

export function implementationBoundary(): string {
  return "exception-handling";
}
