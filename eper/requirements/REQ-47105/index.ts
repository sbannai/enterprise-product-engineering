// GENERATED EPER SOURCE — REQ-47105
// BRD-001-REQ-47105 | SRS-FR-2375 | Pattern XX05
// Source-generation baseline; bind approved contracts before execution.

export type ExceptionDisposition = "RETRY" | "COMPENSATE" | "RECONCILE" | "FAIL";

export const requirement = { id: "REQ-47105", brd: "BRD-001-REQ-47105", srs: "SRS-FR-2375", pattern: "XX05" } as const;

export function implementationBoundary(): string {
  return "exception-handling";
}
