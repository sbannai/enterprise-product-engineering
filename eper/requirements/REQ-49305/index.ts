// GENERATED EPER SOURCE — REQ-49305
// BRD-001-REQ-49305 | SRS-FR-2507 | Pattern XX05
// Source-generation baseline; bind approved contracts before execution.

export type ExceptionDisposition = "RETRY" | "COMPENSATE" | "RECONCILE" | "FAIL";

export const requirement = { id: "REQ-49305", brd: "BRD-001-REQ-49305", srs: "SRS-FR-2507", pattern: "XX05" } as const;

export function implementationBoundary(): string {
  return "exception-handling";
}
