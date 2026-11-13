import { evaluateDependencyCompatibility, type DependencyPolicy, type DependencyInstallation } from "../dependencies/compatibility.js";

export type CapabilityKind = "activity" | "rule" | "integration" | "reporting";
export type CapabilityValueType = "text" | "number" | "boolean" | "date" | "record" | "file" | "event";

export interface CapabilityPort {
  id: string;
  label: string;
  valueType: CapabilityValueType;
  required?: boolean;
  classification?: "public" | "internal" | "confidential" | "restricted";
}
export interface CapabilityOutcome {
  id: string;
  label: string;
}
export interface CapabilityDescriptor {
  typeId: string;
  contractVersion: number;
  kind: CapabilityKind;
  label: string;
  description: string;
  inputs: CapabilityPort[];
  outputs: CapabilityPort[];
  outcomes: CapabilityOutcome[];
  sideEffect: "none" | "external";
  requiresIdempotency?: boolean;
  deprecated?: boolean;
  /** Vendor-managed runtime components required by this capability implementation. */
  dependencies?: readonly {
    policy: DependencyPolicy;
    installation: DependencyInstallation;
  }[];
}
export interface CompositionNode {
  id: string;
  capabilityTypeId: string;
  contractVersion: number;
  label: string;
  configuration: Record<string, unknown>;
}
export interface CompositionEdge {
  id: string;
  kind: "data" | "control";
  fromNodeId: string;
  fromPortId: string;
  toNodeId: string;
  toPortId: string;
}
export interface CapabilityComposition {
  entryNodeId: string;
  nodes: CompositionNode[];
  edges: CompositionEdge[];
}
export interface CompositionDiagnostic {
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
  blocking: boolean;
}

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const MAX_NODES = 200;
const MAX_EDGES = 1000;

/**
 * Validate a customer-authored graph against platform-owned capability descriptors.
 * This validator is deterministic and side-effect free. It deliberately does not
 * attempt coercion, execute customer code, or repair an invalid graph.
 */
export function validateCapabilityComposition(
  graph: CapabilityComposition,
  catalogue: readonly CapabilityDescriptor[],
  options: { evaluatedAt: string } = { evaluatedAt: new Date().toISOString() },
): CompositionDiagnostic[] {
  const diagnostics: CompositionDiagnostic[] = [];
  const add = (code: string, message: string, extra: Partial<CompositionDiagnostic> = {}) =>
    diagnostics.push({ code, message, blocking: true, ...extra });

  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges) ||
      graph.nodes.length < 1 || graph.nodes.length > MAX_NODES ||
      graph.edges.length > MAX_EDGES || !SAFE_ID.test(graph.entryNodeId ?? "")) {
    return [{ code: "composition.shape.invalid", message: "The workflow composition is incomplete or exceeds supported size limits.", blocking: true }];
  }

  const descriptors = new Map<string, CapabilityDescriptor>();
  for (const descriptor of catalogue) {
    if (descriptors.has(descriptor.typeId)) {
      add("catalogue.type.duplicate", "The platform catalogue contains a duplicate capability type.");
    }
    descriptors.set(descriptor.typeId, descriptor);
  }

  const nodes = new Map<string, CompositionNode>();
  const resolved = new Map<string, CapabilityDescriptor>();
  for (const node of graph.nodes) {
    if (!node || !SAFE_ID.test(node.id ?? "") || nodes.has(node.id)) {
      add("composition.node.identity", "Each building block must have a unique valid identity.", { nodeId: node?.id });
      continue;
    }
    nodes.set(node.id, node);
    const descriptor = descriptors.get(node.capabilityTypeId);
    if (!descriptor || descriptor.deprecated || descriptor.contractVersion !== node.contractVersion) {
      add("composition.capability.unsupported", "A building block is unavailable or its definition version is no longer compatible.", { nodeId: node.id });
      continue;
    }
    if (!node.configuration || typeof node.configuration !== "object" || Array.isArray(node.configuration)) {
      add("composition.configuration.invalid", "Complete the building block settings before continuing.", { nodeId: node.id });
      continue;
    }
    for (const dependency of descriptor.dependencies ?? []) {
      try {
        const compatibility = evaluateDependencyCompatibility({
          policy: dependency.policy,
          installation: dependency.installation,
          evaluatedAt: options.evaluatedAt,
        });
        if (compatibility.blocking) {
          add(
            "composition.dependency.blocked",
            "A required vendor component is incompatible or has reached its mandatory-update deadline.",
            { nodeId: node.id },
          );
        }
      } catch {
        add("composition.dependency.policy_invalid", "A required vendor component has an invalid compatibility policy.", { nodeId: node.id });
      }
    }
    if (descriptor.kind === "integration" && descriptor.sideEffect === "external" && descriptor.requiresIdempotency &&
        !Object.prototype.hasOwnProperty.call(node.configuration, "idempotencyPolicy")) {
      add("composition.integration.idempotency_required", "Choose how repeated delivery is safely prevented for this integration.", { nodeId: node.id });
    }
    if (descriptor.kind === "reporting" && descriptor.sideEffect !== "none") {
      add("composition.reporting.read_only", "Reporting building blocks must be read-only.", { nodeId: node.id });
    }
    resolved.set(node.id, descriptor);
  }

  if (!nodes.has(graph.entryNodeId)) {
    add("composition.entry.missing", "Choose a starting building block.", { nodeId: graph.entryNodeId });
  }

  const edgeIds = new Set<string>();
  const incoming = new Map<string, Set<string>>();
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!edge || !SAFE_ID.test(edge.id ?? "") || edgeIds.has(edge.id)) {
      add("composition.edge.identity", "Every connection must have a unique valid identity.", { edgeId: edge?.id });
      continue;
    }
    edgeIds.add(edge.id);
    const source = resolved.get(edge.fromNodeId);
    const target = resolved.get(edge.toNodeId);
    if (!source || !target) {
      add("composition.edge.endpoint", "A connection refers to a missing or unavailable building block.", { edgeId: edge.id });
      continue;
    }
    if (edge.fromNodeId === edge.toNodeId) {
      add("composition.edge.self", "A building block cannot connect directly to itself.", { edgeId: edge.id });
      continue;
    }
    if (edge.kind === "data") {
      const output = source.outputs.find(port => port.id === edge.fromPortId);
      const input = target.inputs.find(port => port.id === edge.toPortId);
      if (!output || !input || output.valueType !== input.valueType) {
        add("composition.port.incompatible", "These building blocks exchange different kinds of information. Choose compatible outputs and inputs.", { edgeId: edge.id });
        continue;
      }
      const existing = incoming.get(edge.toNodeId) ?? new Set<string>();
      existing.add(edge.toPortId);
      incoming.set(edge.toNodeId, existing);
      if (output.classification && input.classification) {
        const levels = ["public", "internal", "confidential", "restricted"];
        if (levels.indexOf(output.classification) > levels.indexOf(input.classification)) {
          add("composition.data.classification", "This connection would lower the protection level of business information.", { edgeId: edge.id });
        }
      }
    } else if (edge.kind === "control") {
      const outcome = source.outcomes.find(item => item.id === edge.fromPortId);
      if (!outcome || !target.inputs.some(port => port.id === edge.toPortId && port.valueType === "event")) {
        add("composition.control.outcome", "Choose a valid outcome and a compatible next-step trigger.", { edgeId: edge.id });
        continue;
      }
      const existing = incoming.get(edge.toNodeId) ?? new Set<string>();
      existing.add(edge.toPortId);
      incoming.set(edge.toNodeId, existing);
      adjacency.set(edge.fromNodeId, [...(adjacency.get(edge.fromNodeId) ?? []), edge.toNodeId]);
    } else {
      add("composition.edge.kind", "This connection type is not supported.", { edgeId: edge.id });
    }
  }

  for (const [nodeId, descriptor] of resolved) {
    const connected = incoming.get(nodeId) ?? new Set<string>();
    for (const input of descriptor.inputs) {
      if (input.required && !connected.has(input.id) &&
          !Object.prototype.hasOwnProperty.call(nodes.get(nodeId)!.configuration, input.id)) {
        add("composition.input.required", "Provide the required information or connect it from an earlier step.", { nodeId });
      }
    }
  }

  // The initial release intentionally rejects all control-flow cycles.
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): void => {
    if (visiting.has(nodeId)) {
      add("composition.control.cycle", "This workflow loops back on itself. Loops are not enabled for this workflow type yet.", { nodeId });
      return;
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    for (const next of adjacency.get(nodeId) ?? []) visit(next);
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  for (const nodeId of nodes.keys()) visit(nodeId);

  // Every valid node must be reachable from the declared entry through control
  // flow. A disconnected component is not an executable workflow branch.
  if (resolved.has(graph.entryNodeId)) {
    const reachable = new Set<string>();
    const queue = [graph.entryNodeId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (reachable.has(current)) continue;
      reachable.add(current);
      for (const next of adjacency.get(current) ?? []) {
        if (!reachable.has(next)) queue.push(next);
      }
    }
    for (const nodeId of resolved.keys()) {
      if (!reachable.has(nodeId)) {
        add("composition.node.unreachable",
          "Every building block must be reachable from the workflow starting point.", { nodeId });
      }
    }
  }

  return diagnostics;
}
