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
      for (const candidate of parsed as unknown[]) {
        if (!candidate || typeof candidate !== "object") throw new Error();
        const p = candidate as AuthorizationPolicy;
        if (typeof p.tenantId !== "string" || !p.tenantId.trim() ||
          !Array.isArray(p.actions) || !p.actions.length ||
          !p.actions.every(v => typeof v === "string" && v.trim()) ||
          !Array.isArray(p.resources) || !p.resources.length ||
          !p.resources.every(v => typeof v === "string" && v.trim()) ||
          (p.effect !== "ALLOW" && p.effect !== "DENY")) throw new Error();
        if (p.principalId !== undefined &&
          (typeof p.principalId !== "string" || !p.principalId.trim())) throw new Error();
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
    if (!policy || typeof policy !== "object" ||
      typeof policy.tenantId !== "string" || !policy.tenantId.trim() ||
      (policy.principalId !== undefined &&
        (typeof policy.principalId !== "string" || !policy.principalId.trim())) ||
      !Array.isArray(policy.actions) || !policy.actions.length ||
      !policy.actions.every(v => typeof v === "string" && v.trim()) ||
      !Array.isArray(policy.resources) || !policy.resources.length ||
      !policy.resources.every(v => typeof v === "string" && v.trim()) ||
      (policy.effect !== "ALLOW" && policy.effect !== "DENY")) {
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
