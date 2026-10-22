import { randomUUID } from "node:crypto";

export type SimulationFault = "none" | "validation" | "denied" | "duplicate" | "timeout";
export type SimulationRunStatus = "SIMULATED_SUCCESS" | "SIMULATED_FAILED";
export type FlowStepKind = "transform" | "validate" | "route" | "audit";

export interface FlowStep {
  readonly stepId: string;
  readonly name: string;
  readonly kind: FlowStepKind;
  readonly sourceApplicationId: string;
  readonly targetApplicationId: string;
}

export interface ApplicationFlow {
  readonly flowId: string;
  readonly tenantId: string;
  readonly name: string;
  readonly steps: readonly FlowStep[];
}

export interface SimulatedStepResult {
  readonly stepId: string;
  readonly name: string;
  readonly status: "SIMULATED_SUCCESS" | "SIMULATED_FAILED" | "SKIPPED";
  readonly detail: string;
  readonly startedAt: string;
  readonly completedAt: string;
}

export interface SimulationRun {
  readonly runId: string;
  readonly tenantId: string;
  readonly flowId: string;
  readonly eventId: string;
  readonly correlationId: string;
  readonly evidenceMode: "SIMULATED";
  readonly status: SimulationRunStatus;
  readonly fault: SimulationFault;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly steps: readonly SimulatedStepResult[];
  readonly note: "NO_EXTERNAL_SIDE_EFFECTS";
}

export interface TenantApplicationLookup {
  get(tenantId: string, applicationId: string): { readonly applicationId: string; readonly tenantId: string; readonly lifecycle: string };
}

/**
 * Deterministic, offline-only flow simulation. It never invokes application APIs,
 * payment gateways, or external connectors. Run history is process-local only.
 */
export class ApplicationFlowSimulator {
  private readonly runs = new Map<string, SimulationRun>();
  private readonly eventRuns = new Map<string, string>();
  private readonly clock: () => Date;

  constructor(private readonly applications: TenantApplicationLookup, clock: () => Date = () => new Date()) {
    this.clock = clock;
  }

  simulate(tenantId: string, flow: ApplicationFlow, fault: SimulationFault = "none", eventId?: string): SimulationRun {
    const scopedTenant = tenantId?.trim();
    if (!scopedTenant || !flow || flow.tenantId !== scopedTenant) throw new Error("FLOW_TENANT_SCOPE_MISMATCH");
    if (!flow.flowId?.trim() || !flow.name?.trim() || !Array.isArray(flow.steps) || flow.steps.length === 0) {
      throw new Error("FLOW_DEFINITION_INVALID");
    }
    if (!["none", "validation", "denied", "duplicate", "timeout"].includes(fault)) throw new Error("SIMULATION_FAULT_INVALID");
    for (const step of flow.steps) {
      if (!step.stepId?.trim() || !step.name?.trim() || !["transform", "validate", "route", "audit"].includes(step.kind)) {
        throw new Error("FLOW_STEP_INVALID");
      }
      for (const applicationId of [step.sourceApplicationId, step.targetApplicationId]) {
        const app = this.applications.get(scopedTenant, applicationId);
        if (app.tenantId !== scopedTenant || app.lifecycle === "ARCHIVED") throw new Error("FLOW_APPLICATION_UNAVAILABLE");
      }
    }

    const startedAt = this.clock().toISOString();
    const runId = randomUUID();
    const correlationId = randomUUID();
    const resolvedEventId = eventId?.trim() || randomUUID();
    const eventKey = `${scopedTenant.length}:${scopedTenant}:${resolvedEventId}`;
    const duplicate = fault === "duplicate" || this.eventRuns.has(eventKey);
    const stepResults: SimulatedStepResult[] = [];
    let failed = duplicate;
    for (let i = 0; i < flow.steps.length; i++) {
      const step = flow.steps[i];
      const stepStarted = this.clock().toISOString();
      let status: SimulatedStepResult["status"] = "SIMULATED_SUCCESS";
      let detail = `${step.kind} simulated; no payload sent externally`;
      const injectHere = !failed && (
        (fault === "validation" && step.kind === "validate") ||
        (fault === "denied" && step.kind === "route") ||
        (fault === "timeout" && i === flow.steps.length - 1)
      );
      if (failed) {
        status = "SKIPPED";
        detail = "Skipped because the event was already rejected";
      } else if (injectHere) {
        status = "SIMULATED_FAILED";
        detail = fault === "validation" ? "Injected validation failure" :
          fault === "denied" ? "Injected authorization denial" : "Injected simulated timeout";
        failed = true;
      } else if (duplicate) {
        status = "SIMULATED_FAILED";
        detail = "Duplicate event ID rejected; no replay executed";
        failed = true;
      }
      stepResults.push({ stepId: step.stepId, name: step.name, status, detail, startedAt: stepStarted, completedAt: this.clock().toISOString() });
    }
    if (duplicate && stepResults.every((step) => step.status === "SKIPPED")) {
      const first = flow.steps[0];
      stepResults[0] = { stepId: first.stepId, name: first.name, status: "SIMULATED_FAILED", detail: "Duplicate event ID rejected; no replay executed", startedAt: startedAt, completedAt: this.clock().toISOString() };
    }
    const completedAt = this.clock().toISOString();
    const run: SimulationRun = {
      runId, tenantId: scopedTenant, flowId: flow.flowId, eventId: resolvedEventId, correlationId,
      evidenceMode: "SIMULATED", status: failed ? "SIMULATED_FAILED" : "SIMULATED_SUCCESS",
      fault, startedAt, completedAt, steps: stepResults, note: "NO_EXTERNAL_SIDE_EFFECTS",
    };
    this.runs.set(runId, run);
    if (!duplicate) this.eventRuns.set(eventKey, runId);
    return this.copy(run);
  }

  getRun(tenantId: string, runId: string): SimulationRun {
    const run = this.runs.get(runId);
    if (!run || run.tenantId !== tenantId) throw new Error("SIMULATION_RUN_NOT_FOUND");
    return this.copy(run);
  }

  listRuns(tenantId: string): SimulationRun[] {
    if (!tenantId?.trim()) throw new Error("FLOW_TENANT_SCOPE_REQUIRED");
    return [...this.runs.values()].filter((run) => run.tenantId === tenantId)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt)).map((run) => this.copy(run));
  }

  private copy(run: SimulationRun): SimulationRun {
    return { ...run, steps: run.steps.map((step) => ({ ...step })) };
  }
}
