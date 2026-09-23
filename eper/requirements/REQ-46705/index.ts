// GENERATED EPER SOURCE — REQ-46705
// BRD-001-REQ-46705 | SRS-FR-2351 | Pattern XX05
// Source-generation baseline; bind approved contracts before execution.

export type ExceptionDisposition = "RETRY" | "COMPENSATE" | "RECONCILE" | "FAIL";

export const requirement = { id: "REQ-46705", brd: "BRD-001-REQ-46705", srs: "SRS-FR-2351", pattern: "XX05" } as const;

export function implementationBoundary(): string {
  return "exception-handling";
}
