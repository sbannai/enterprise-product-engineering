// GENERATED EPER SOURCE — REQ-47305
// BRD-001-REQ-47305 | SRS-FR-2387 | Pattern XX05
// Source-generation baseline; bind approved contracts before execution.

export type ExceptionDisposition = "RETRY" | "COMPENSATE" | "RECONCILE" | "FAIL";

export const requirement = { id: "REQ-47305", brd: "BRD-001-REQ-47305", srs: "SRS-FR-2387", pattern: "XX05" } as const;

export function implementationBoundary(): string {
  return "exception-handling";
}
