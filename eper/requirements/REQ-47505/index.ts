// GENERATED EPER SOURCE — REQ-47505
// BRD-001-REQ-47505 | SRS-FR-2399 | Pattern XX05
// Source-generation baseline; bind approved contracts before execution.

export type ExceptionDisposition = "RETRY" | "COMPENSATE" | "RECONCILE" | "FAIL";

export const requirement = { id: "REQ-47505", brd: "BRD-001-REQ-47505", srs: "SRS-FR-2399", pattern: "XX05" } as const;

export function implementationBoundary(): string {
  return "exception-handling";
}
