import type { ApplicationDataContext } from "./contracts.js";
import { MongoApplicationDataAdapter, type MongoSessionLike, type MongoWorkflowAuthorizer } from "./mongo-adapter.js";

interface MongoGrantCollection {
  findOne(filter: Record<string, unknown>, options?: Record<string, unknown>): Promise<Record<string, unknown> | null>;
}
interface MongoAuthorizationDatabase {
  collection<T extends Record<string, unknown>>(name: string): MongoGrantCollection;
}

/**
 * Resolves the actor's active workflow grant from the application-data provider.
 * Grant documents are provisioned in eper_workflow_authorization_grants and carry
 * tenantId, applicationId, actorId, roleId, status, and a permissions string array.
 * The lookup is session-bound so grant revocation and data access serialize in one transaction.
 */
export function createMongoWorkflowAuthorizer(database: unknown): MongoWorkflowAuthorizer {
  const db = database as MongoAuthorizationDatabase;
  if (!db || typeof db.collection !== "function") {
    throw new Error("MONGODB_WORKFLOW_AUTHORIZATION_STORE_REQUIRED");
  }
  return async (session: MongoSessionLike, context: ApplicationDataContext): Promise<void> => {
    if (!context.workflowRoleId || !context.workflowPermission) {
      throw new Error("APPLICATION_DATA_WORKFLOW_AUTHORIZATION_CONTEXT_MISSING");
    }
    const permissions = context.workflowPermission === "workflow:act"
      ? ["workflow:act", "workflow:admin"]
      : [context.workflowPermission];
    const grant = await db.collection("eper_workflow_authorization_grants").findOne({
      tenantId: context.tenantId,
      applicationId: context.applicationId,
      actorId: context.actorId,
      roleId: context.workflowRoleId,
      status: "active",
      permissions: { $in: permissions },
    }, { session });
    if (!grant) throw new Error("APPLICATION_DATA_WORKFLOW_PERMISSION_REVOKED");
  };
}

/** Create the scoped lookup index during provider bootstrap, not on request paths. */
export async function ensureMongoWorkflowAuthorizationIndexes(database: unknown): Promise<void> {
  const db = database as MongoAuthorizationDatabase & {
    collection<T extends Record<string, unknown>>(name: string): MongoGrantCollection & {
      createIndex?(keys: Record<string, 1 | -1>, options?: Record<string, unknown>): Promise<string>;
    };
  };
  const collection = db.collection("eper_workflow_authorization_grants");
  if (typeof collection.createIndex !== "function") {
    throw new Error("MONGODB_INDEX_MANAGEMENT_REQUIRED");
  }
  await collection.createIndex(
    { tenantId: 1, applicationId: 1, actorId: 1, roleId: 1, status: 1 },
    { name: "eper_workflow_authorization_grant_scope" },
  );
}

/** Build the MongoDB provider with grant authorization and required indexes configured before use. */
export async function createMongoApplicationDataAdapter(database: unknown): Promise<MongoApplicationDataAdapter> {
  const adapter = new MongoApplicationDataAdapter(database, createMongoWorkflowAuthorizer(database));
  await adapter.ensureIndexes();
  await ensureMongoWorkflowAuthorizationIndexes(database);
  return adapter;
}
