// GENERATED EPER SOURCE — REQ-47905
// BRD-001-REQ-47905 | SRS-FR-2423 | Pattern XX05
// Source-generation baseline; bind approved contracts before execution.

export type ExceptionDisposition = "RETRY" | "COMPENSATE" | "RECONCILE" | "FAIL";

export const requirement = { id: "REQ-47905", brd: "BRD-001-REQ-47905", srs: "SRS-FR-2423", pattern: "XX05" } as const;

export function implementationBoundary(): string {
  return "exception-handling";
}
