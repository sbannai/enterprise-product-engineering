// GENERATED EPER SOURCE — REQ-47605
// BRD-001-REQ-47605 | SRS-FR-2405 | Pattern XX05
// Source-generation baseline; bind approved contracts before execution.

export type ExceptionDisposition = "RETRY" | "COMPENSATE" | "RECONCILE" | "FAIL";

export const requirement = { id: "REQ-47605", brd: "BRD-001-REQ-47605", srs: "SRS-FR-2405", pattern: "XX05" } as const;

export function implementationBoundary(): string {
  return "exception-handling";
}
