// GENERATED EPER SOURCE — REQ-46905
// BRD-001-REQ-46905 | SRS-FR-2363 | Pattern XX05
// Source-generation baseline; bind approved contracts before execution.

export type ExceptionDisposition = "RETRY" | "COMPENSATE" | "RECONCILE" | "FAIL";

export const requirement = { id: "REQ-46905", brd: "BRD-001-REQ-46905", srs: "SRS-FR-2363", pattern: "XX05" } as const;

export function implementationBoundary(): string {
  return "exception-handling";
}
