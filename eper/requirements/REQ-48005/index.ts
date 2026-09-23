// GENERATED EPER SOURCE — REQ-48005
// BRD-001-REQ-48005 | SRS-FR-2429 | Pattern XX05
// Source-generation baseline; bind approved contracts before execution.

export type ExceptionDisposition = "RETRY" | "COMPENSATE" | "RECONCILE" | "FAIL";

export const requirement = { id: "REQ-48005", brd: "BRD-001-REQ-48005", srs: "SRS-FR-2429", pattern: "XX05" } as const;

export function implementationBoundary(): string {
  return "exception-handling";
}
