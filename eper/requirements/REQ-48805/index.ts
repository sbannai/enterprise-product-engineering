// GENERATED EPER SOURCE — REQ-48805
// BRD-001-REQ-48805 | SRS-FR-2477 | Pattern XX05
// Source-generation baseline; bind approved contracts before execution.

export type ExceptionDisposition = "RETRY" | "COMPENSATE" | "RECONCILE" | "FAIL";

export const requirement = { id: "REQ-48805", brd: "BRD-001-REQ-48805", srs: "SRS-FR-2477", pattern: "XX05" } as const;

export function implementationBoundary(): string {
  return "exception-handling";
}
