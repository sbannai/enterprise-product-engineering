// GENERATED EPER SOURCE — REQ-47005
// BRD-001-REQ-47005 | SRS-FR-2369 | Pattern XX05
// Source-generation baseline; bind approved contracts before execution.

export type ExceptionDisposition = "RETRY" | "COMPENSATE" | "RECONCILE" | "FAIL";

export const requirement = { id: "REQ-47005", brd: "BRD-001-REQ-47005", srs: "SRS-FR-2369", pattern: "XX05" } as const;

export function implementationBoundary(): string {
  return "exception-handling";
}
