// GENERATED EPER SOURCE — REQ-48605
// BRD-001-REQ-48605 | SRS-FR-2465 | Pattern XX05
// Source-generation baseline; bind approved contracts before execution.

export type ExceptionDisposition = "RETRY" | "COMPENSATE" | "RECONCILE" | "FAIL";

export const requirement = { id: "REQ-48605", brd: "BRD-001-REQ-48605", srs: "SRS-FR-2465", pattern: "XX05" } as const;

export function implementationBoundary(): string {
  return "exception-handling";
}
