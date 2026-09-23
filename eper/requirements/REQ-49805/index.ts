// GENERATED EPER SOURCE — REQ-49805
// BRD-001-REQ-49805 | SRS-FR-2537 | Pattern XX05
// Source-generation baseline; bind approved contracts before execution.

export type ExceptionDisposition = "RETRY" | "COMPENSATE" | "RECONCILE" | "FAIL";

export const requirement = { id: "REQ-49805", brd: "BRD-001-REQ-49805", srs: "SRS-FR-2537", pattern: "XX05" } as const;

export function implementationBoundary(): string {
  return "exception-handling";
}
