// GENERATED EPER SOURCE — REQ-49405
// BRD-001-REQ-49405 | SRS-FR-2513 | Pattern XX05
// Source-generation baseline; bind approved contracts before execution.

export type ExceptionDisposition = "RETRY" | "COMPENSATE" | "RECONCILE" | "FAIL";

export const requirement = { id: "REQ-49405", brd: "BRD-001-REQ-49405", srs: "SRS-FR-2513", pattern: "XX05" } as const;

export function implementationBoundary(): string {
  return "exception-handling";
}
