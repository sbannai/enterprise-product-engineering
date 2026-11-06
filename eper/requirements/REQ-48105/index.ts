// GENERATED EPER SOURCE — REQ-48105
// BRD-001-REQ-48105 | SRS-FR-2435 | Pattern XX05
// Source-generation baseline; bind approved contracts before execution.

export type ExceptionDisposition = "RETRY" | "COMPENSATE" | "RECONCILE" | "FAIL";

export const requirement = { id: "REQ-48105", brd: "BRD-001-REQ-48105", srs: "SRS-FR-2435", pattern: "XX05" } as const;

export function implementationBoundary(): string {
  return "exception-handling";
}
