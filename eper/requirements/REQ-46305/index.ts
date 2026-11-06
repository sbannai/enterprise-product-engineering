// GENERATED EPER SOURCE — REQ-46305
// BRD-001-REQ-46305 | SRS-FR-2327 | Pattern XX05
// Source-generation baseline; bind approved contracts before execution.

export type ExceptionDisposition = "RETRY" | "COMPENSATE" | "RECONCILE" | "FAIL";

export const requirement = { id: "REQ-46305", brd: "BRD-001-REQ-46305", srs: "SRS-FR-2327", pattern: "XX05" } as const;

export function implementationBoundary(): string {
  return "exception-handling";
}
