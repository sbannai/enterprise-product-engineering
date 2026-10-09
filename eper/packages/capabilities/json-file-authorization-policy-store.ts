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
      for (const p of parsed as AuthorizationPolicy[]) {
        if (!p || !p.tenantId || !Array.isArray(p.actions) || !p.actions.length ||
          !Array.isArray(p.resources) || !p.resources.length || !["ALLOW", "DENY"].includes(p.effect)) throw new Error();
        if (p.principalId !== undefined && typeof p.principalId !== "string") throw new Error();
      }
      return parsed as AuthorizationPolicy[];
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
    if (!policy.tenantId || !Array.isArray(policy.actions) || !policy.actions.length ||
      !policy.actions.every(v => typeof v === "string" && v.length > 0) ||
      !Array.isArray(policy.resources) || !policy.resources.length ||
      !policy.resources.every(v => typeof v === "string" && v.length > 0) ||
      !["ALLOW", "DENY"].includes(policy.effect) ||
      (policy.principalId !== undefined && !policy.principalId)) {
      throw new Error("AUTHORIZATION_POLICY_INVALID");
    }
    const policies = this.read();
    policies.push({ ...policy, actions: [...policy.actions], resources: [...policy.resources] });
    this.commit(policies);
  }
  decide(request: AuthorizationRequest): AuthorizationDecision {
    return new InMemoryAuthorizationService(this.read()).decide(request);
  }
}
