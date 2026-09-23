// GENERATED EPER SOURCE — REQ-48905
// BRD-001-REQ-48905 | SRS-FR-2483 | Pattern XX05
// Source-generation baseline; bind approved contracts before execution.

export type ExceptionDisposition = "RETRY" | "COMPENSATE" | "RECONCILE" | "FAIL";

export const requirement = { id: "REQ-48905", brd: "BRD-001-REQ-48905", srs: "SRS-FR-2483", pattern: "XX05" } as const;

export function implementationBoundary(): string {
  return "exception-handling";
}
