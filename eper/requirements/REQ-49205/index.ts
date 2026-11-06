// GENERATED EPER SOURCE — REQ-49205
// BRD-001-REQ-49205 | SRS-FR-2501 | Pattern XX05
// Source-generation baseline; bind approved contracts before execution.

export type ExceptionDisposition = "RETRY" | "COMPENSATE" | "RECONCILE" | "FAIL";

export const requirement = { id: "REQ-49205", brd: "BRD-001-REQ-49205", srs: "SRS-FR-2501", pattern: "XX05" } as const;

export function implementationBoundary(): string {
  return "exception-handling";
}
