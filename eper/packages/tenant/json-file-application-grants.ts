import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ApplicationGrant } from "./application-access.js";
import type {
  ApplicationGrantStore,
  PermissionAuditEvent,
  PermissionAuditSink,
} from "./application-grants.js";

/**
 * Local/UAT JSON adapter. This is not a multi-process transactional database.
 * Use a database-backed repository and transactional audit outbox in production.
 */
export class JsonFileApplicationGrantStore implements ApplicationGrantStore {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    mkdirSync(dirname(filePath), { recursive: true });
    if (!existsSync(filePath)) this.writeAtomic([]);
  }

  list(): readonly ApplicationGrant[] {
    const value: unknown = JSON.parse(readFileSync(this.filePath, "utf8"));
    if (!Array.isArray(value)) throw new Error("APPLICATION_GRANT_STORE_CORRUPT");
    return value.map((grant) => {
      if (!grant || typeof grant !== "object" || !Array.isArray((grant as ApplicationGrant).actions)) {
        throw new Error("APPLICATION_GRANT_STORE_CORRUPT");
      }
      const item = grant as ApplicationGrant;
      return { ...item, actions: [...item.actions] };
    });
  }

  replaceForPrincipal(
    scope: { tenantId: string; applicationId: string; environment: ApplicationGrant["environment"] },
    principalId: string,
    grants: readonly ApplicationGrant[],
  ): void {
    const retained = this.list().filter((grant) => !(
      grant.tenantId === scope.tenantId &&
      grant.applicationId === scope.applicationId &&
      grant.environment === scope.environment &&
      grant.principalId === principalId
    ));
    retained.push(...grants.map((grant) => ({ ...grant, actions: [...grant.actions] })));
    this.writeAtomic(retained);
  }

  private writeAtomic(grants: readonly ApplicationGrant[]): void {
    const temporary = join(dirname(this.filePath), `.${randomUUID()}.tmp`);
    writeFileSync(temporary, JSON.stringify(grants, null, 2), { encoding: "utf8", mode: 0o600 });
    renameSync(temporary, this.filePath);
  }
}

/** Append-only JSON-lines sink for local/UAT. Protect the containing directory. */
export class JsonLinesPermissionAuditSink implements PermissionAuditSink {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    mkdirSync(dirname(filePath), { recursive: true });
    if (!existsSync(filePath)) writeFileSync(filePath, "", { encoding: "utf8", mode: 0o600 });
  }

  append(event: PermissionAuditEvent): void {
    // Open-and-append avoids replacing prior audit events; production should use a
    // durable append-only store with transactional coupling to the grant update.
    const { appendFileSync } = requireFs();
    appendFileSync(this.filePath, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
  }
}

function requireFs(): typeof import("node:fs") {
  // Static import shape keeps this helper synchronous and compatible with NodeNext.
  return require("node:fs") as typeof import("node:fs");
}
