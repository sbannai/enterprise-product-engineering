// GENERATED EPER SOURCE — REQ-49005
// BRD-001-REQ-49005 | SRS-FR-2489 | Pattern XX05
// Source-generation baseline; bind approved contracts before execution.

export type ExceptionDisposition = "RETRY" | "COMPENSATE" | "RECONCILE" | "FAIL";

export const requirement = { id: "REQ-49005", brd: "BRD-001-REQ-49005", srs: "SRS-FR-2489", pattern: "XX05" } as const;

export function implementationBoundary(): string {
  return "exception-handling";
}
