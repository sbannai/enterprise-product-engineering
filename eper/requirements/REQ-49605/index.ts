// GENERATED EPER SOURCE — REQ-49605
// BRD-001-REQ-49605 | SRS-FR-2525 | Pattern XX05
// Source-generation baseline; bind approved contracts before execution.

export type ExceptionDisposition = "RETRY" | "COMPENSATE" | "RECONCILE" | "FAIL";

export const requirement = { id: "REQ-49605", brd: "BRD-001-REQ-49605", srs: "SRS-FR-2525", pattern: "XX05" } as const;

export function implementationBoundary(): string {
  return "exception-handling";
}
