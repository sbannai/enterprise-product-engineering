// GENERATED EPER SOURCE — REQ-48305
// BRD-001-REQ-48305 | SRS-FR-2447 | Pattern XX05
// Source-generation baseline; bind approved contracts before execution.

export type ExceptionDisposition = "RETRY" | "COMPENSATE" | "RECONCILE" | "FAIL";

export const requirement = { id: "REQ-48305", brd: "BRD-001-REQ-48305", srs: "SRS-FR-2447", pattern: "XX05" } as const;

export function implementationBoundary(): string {
  return "exception-handling";
}
