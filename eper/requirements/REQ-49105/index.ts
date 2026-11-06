// GENERATED EPER SOURCE — REQ-49105
// BRD-001-REQ-49105 | SRS-FR-2495 | Pattern XX05
// Source-generation baseline; bind approved contracts before execution.

export type ExceptionDisposition = "RETRY" | "COMPENSATE" | "RECONCILE" | "FAIL";

export const requirement = { id: "REQ-49105", brd: "BRD-001-REQ-49105", srs: "SRS-FR-2495", pattern: "XX05" } as const;

export function implementationBoundary(): string {
  return "exception-handling";
}
