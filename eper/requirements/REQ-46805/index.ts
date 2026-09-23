// GENERATED EPER SOURCE — REQ-46805
// BRD-001-REQ-46805 | SRS-FR-2357 | Pattern XX05
// Source-generation baseline; bind approved contracts before execution.

export type ExceptionDisposition = "RETRY" | "COMPENSATE" | "RECONCILE" | "FAIL";

export const requirement = { id: "REQ-46805", brd: "BRD-001-REQ-46805", srs: "SRS-FR-2357", pattern: "XX05" } as const;

export function implementationBoundary(): string {
  return "exception-handling";
}
