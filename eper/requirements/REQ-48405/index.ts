// GENERATED EPER SOURCE — REQ-48405
// BRD-001-REQ-48405 | SRS-FR-2453 | Pattern XX05
// Source-generation baseline; bind approved contracts before execution.

export type ExceptionDisposition = "RETRY" | "COMPENSATE" | "RECONCILE" | "FAIL";

export const requirement = { id: "REQ-48405", brd: "BRD-001-REQ-48405", srs: "SRS-FR-2453", pattern: "XX05" } as const;

export function implementationBoundary(): string {
  return "exception-handling";
}
