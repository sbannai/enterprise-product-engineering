import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  InMemoryAuthorizationService,
  type AuthorizationDecision,
  type AuthorizationPolicy,
  type AuthorizationPolicyStore,
  type AuthorizationRequest,
} from "./authorization.js";

/** Local durable adapter for isolated development/UAT. Not safe for concurrent writers. */
export class JsonFileAuthorizationPolicyStore implements AuthorizationPolicyStore {
  constructor(private readonly filePath: string) {
    if (!filePath?.trim()) throw new Error("PERSISTENCE_PATH_REQUIRED");
    mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
    try { readFileSync(filePath, "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; this.commit([]); }
  }
  private read(): AuthorizationPolicy[] {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, "utf8"));
      if (!Array.isArray(parsed)) throw new Error();
      const policies = parsed as AuthorizationPolicy[];
      const identities = new Set<string>();
      for (const p of policies) {
        if (!p || typeof p !== "object" || Array.isArray(p) ||
          typeof p.tenantId !== "string" || !p.tenantId.trim() ||
          (p.principalId !== undefined && (typeof p.principalId !== "string" || !p.principalId.trim())) ||
          !Array.isArray(p.actions) || !p.actions.length ||
          !p.actions.every(action => typeof action === "string" && action.trim().length > 0) ||
          new Set(p.actions).size !== p.actions.length ||
          !Array.isArray(p.resources) || !p.resources.length ||
          !p.resources.every(resource => typeof resource === "string" && resource.trim().length > 0) ||
          new Set(p.resources).size !== p.resources.length ||
          (p.effect !== "ALLOW" && p.effect !== "DENY")) throw new Error();
        const identity = JSON.stringify([p.tenantId, p.principalId ?? null, p.effect, [...p.actions].sort(), [...p.resources].sort()]);
        if (identities.has(identity)) throw new Error();
        identities.add(identity);
      }
      return policies;
    } catch { throw new Error("PERSISTENCE_DATA_INVALID"); }
  }
  private commit(policies: readonly AuthorizationPolicy[]): void {
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(policies), { encoding: "utf8", mode: 0o600, flag: "wx" });
    renameSync(temporary, this.filePath);
  }
  snapshot(): readonly AuthorizationPolicy[] {
    return this.read().map(p => ({ ...p, actions: [...p.actions], resources: [...p.resources] }));
  }
  addPolicy(policy: AuthorizationPolicy): void {
    if (!policy || typeof policy !== "object" || Array.isArray(policy) ||
      typeof policy.tenantId !== "string" || !policy.tenantId.trim() ||
      (policy.principalId !== undefined && (typeof policy.principalId !== "string" || !policy.principalId.trim())) ||
      !Array.isArray(policy.actions) || !policy.actions.length ||
      !policy.actions.every(v => typeof v === "string" && v.trim().length > 0) ||
      new Set(policy.actions).size !== policy.actions.length ||
      !Array.isArray(policy.resources) || !policy.resources.length ||
      !policy.resources.every(v => typeof v === "string" && v.trim().length > 0) ||
      new Set(policy.resources).size !== policy.resources.length ||
      (policy.effect !== "ALLOW" && policy.effect !== "DENY")) {
      throw new Error("AUTHORIZATION_POLICY_INVALID");
    }
    const policies = this.read();
    const identity = JSON.stringify([policy.tenantId, policy.principalId ?? null, policy.effect, [...policy.actions].sort(), [...policy.resources].sort()]);
    const duplicate = policies.some(existing =>
      JSON.stringify([existing.tenantId, existing.principalId ?? null, existing.effect, [...existing.actions].sort(), [...existing.resources].sort()]) === identity);
    if (duplicate) throw new Error("AUTHORIZATION_POLICY_ALREADY_EXISTS");
    policies.push({ ...policy, actions: [...policy.actions], resources: [...policy.resources] });
    this.commit(policies);
  }
  decide(request: AuthorizationRequest): AuthorizationDecision {
    return new InMemoryAuthorizationService(this.read()).decide(request);
  }
}
