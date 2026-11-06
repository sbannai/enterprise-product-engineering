import type { RequirementBinding } from "../packages/requirements/registry.js";

export interface ContractDescriptor {
  id: string;
  kind: "DATA" | "API" | "EVENT";
  capability: string;
  version: "v1";
}

export interface CapabilityContracts {
  data: ContractDescriptor;
  api: ContractDescriptor;
  event: ContractDescriptor;
}

const contracts: Record<string, CapabilityContracts> = {
  "authoritative-records": {
    data: { id: "DATA:authoritative-domain", kind: "DATA", capability: "authoritative-records", version: "v1" },
    api: { id: "API:capability-resource", kind: "API", capability: "authoritative-records", version: "v1" },
    event: { id: "EVENT:material-lifecycle", kind: "EVENT", capability: "authoritative-records", version: "v1" },
  },
  authorization: {
    data: { id: "DATA:identity-policy", kind: "DATA", capability: "authorization", version: "v1" },
    api: { id: "API:secured-capability", kind: "API", capability: "authorization", version: "v1" },
    event: { id: "EVENT:authorization-audit", kind: "EVENT", capability: "authorization", version: "v1" },
  },
  "business-validation": {
    data: { id: "DATA:domain-rules", kind: "DATA", capability: "business-validation", version: "v1" },
    api: { id: "API:validated-command", kind: "API", capability: "business-validation", version: "v1" },
    event: { id: "EVENT:validation-outcome", kind: "EVENT", capability: "business-validation", version: "v1" },
  },
  "audit-evidence": {
    data: { id: "DATA:audit-record", kind: "DATA", capability: "audit-evidence", version: "v1" },
    api: { id: "API:audit-retrieval", kind: "API", capability: "audit-evidence", version: "v1" },
    event: { id: "EVENT:audit-material-event", kind: "EVENT", capability: "audit-evidence", version: "v1" },
  },
  "exception-handling": {
    data: { id: "DATA:workflow-exception", kind: "DATA", capability: "exception-handling", version: "v1" },
    api: { id: "API:recovery-command", kind: "API", capability: "exception-handling", version: "v1" },
    event: { id: "EVENT:exception-lifecycle", kind: "EVENT", capability: "exception-handling", version: "v1" },
  },
  "governed-reporting": {
    data: { id: "DATA:derived-reporting", kind: "DATA", capability: "governed-reporting", version: "v1" },
    api: { id: "API:report-query", kind: "API", capability: "governed-reporting", version: "v1" },
    event: { id: "EVENT:report-refresh", kind: "EVENT", capability: "governed-reporting", version: "v1" },
  },
};

export function getCapabilityContracts(capability: string): CapabilityContracts {
  const value = contracts[capability];
  if (!value) throw new Error(`CONTRACTS_NOT_DEFINED:${capability}`);
  return value;
}

export function validateRequirementContracts(requirement: RequirementBinding): CapabilityContracts {
  const value = getCapabilityContracts(requirement.capability);
  if (requirement.dataContract !== value.data.id) throw new Error(`DATA_CONTRACT_MISMATCH:${requirement.id}`);
  if (requirement.apiContract !== value.api.id) throw new Error(`API_CONTRACT_MISMATCH:${requirement.id}`);
  if (requirement.eventContract !== value.event.id) throw new Error(`EVENT_CONTRACT_MISMATCH:${requirement.id}`);
  return value;
}

export function getContractCapabilityIds(): readonly string[] {
  return Object.freeze(Object.keys(contracts));
}
