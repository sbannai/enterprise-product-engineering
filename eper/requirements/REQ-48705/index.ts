// GENERATED EPER SOURCE — REQ-48705
// BRD-001-REQ-48705 | SRS-FR-2471 | Pattern XX05
// Source-generation baseline; bind approved contracts before execution.

export type ExceptionDisposition = "RETRY" | "COMPENSATE" | "RECONCILE" | "FAIL";

export const requirement = { id: "REQ-48705", brd: "BRD-001-REQ-48705", srs: "SRS-FR-2471", pattern: "XX05" } as const;

export function implementationBoundary(): string {
  return "exception-handling";
}
