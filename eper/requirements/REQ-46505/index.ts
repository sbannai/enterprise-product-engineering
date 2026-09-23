// GENERATED EPER SOURCE — REQ-46505
// BRD-001-REQ-46505 | SRS-FR-2339 | Pattern XX05
// Source-generation baseline; bind approved contracts before execution.

export type ExceptionDisposition = "RETRY" | "COMPENSATE" | "RECONCILE" | "FAIL";

export const requirement = { id: "REQ-46505", brd: "BRD-001-REQ-46505", srs: "SRS-FR-2339", pattern: "XX05" } as const;

export function implementationBoundary(): string {
  return "exception-handling";
}
