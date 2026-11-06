// GENERATED EPER SOURCE — REQ-47805
// BRD-001-REQ-47805 | SRS-FR-2417 | Pattern XX05
// Source-generation baseline; bind approved contracts before execution.

export type ExceptionDisposition = "RETRY" | "COMPENSATE" | "RECONCILE" | "FAIL";

export const requirement = { id: "REQ-47805", brd: "BRD-001-REQ-47805", srs: "SRS-FR-2417", pattern: "XX05" } as const;

export function implementationBoundary(): string {
  return "exception-handling";
}
