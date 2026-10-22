import { randomUUID } from "node:crypto";

export type ApplicationLifecycle = "DRAFT" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";

export interface ApplicationRecord {
  readonly applicationId: string;
  readonly tenantId: string;
  readonly name: string;
  readonly slug: string;
  readonly lifecycle: ApplicationLifecycle;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface CreateApplicationInput {
  readonly tenantId: string;
  readonly name: string;
  readonly slug: string;
}

export interface UpdateApplicationInput {
  readonly name?: string;
  readonly lifecycle?: ApplicationLifecycle;
}

/**
 * Tenant-scoped application registry with in-memory storage.
 *
 * This is an initial service seam for tests and local prototypes, not durable
 * persistence. A production adapter and authenticated request integration are
 * required before this registry can be used as a system of record.
 */
export class ApplicationRegistryService {
  private readonly records = new Map<string, ApplicationRecord>();
  private readonly slugIndex = new Map<string, string>();
  private readonly clock: () => Date;

  constructor(clock: () => Date = () => new Date()) {
    this.clock = clock;
  }

  create(input: CreateApplicationInput): ApplicationRecord {
    const tenantId = input?.tenantId?.trim();
    const name = input?.name?.trim();
    const slug = input?.slug?.trim().toLowerCase();

    if (!tenantId || !name || !slug) throw new Error("APPLICATION_INPUT_REQUIRED");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("APPLICATION_SLUG_INVALID");

    const slugKey = this.key(tenantId, slug);
    if (this.slugIndex.has(slugKey)) throw new Error("APPLICATION_SLUG_CONFLICT");

    const now = this.clock().toISOString();
    const record: ApplicationRecord = {
      applicationId: randomUUID(),
      tenantId,
      name,
      slug,
      lifecycle: "DRAFT",
      createdAt: now,
      updatedAt: now,
      version: 1,
    };
    this.records.set(record.applicationId, record);
    this.slugIndex.set(slugKey, record.applicationId);
    return { ...record };
  }

  get(tenantId: string, applicationId: string): ApplicationRecord {
    if (!tenantId?.trim() || !applicationId?.trim()) throw new Error("APPLICATION_SCOPE_REQUIRED");
    const record = this.records.get(applicationId);
    if (!record || record.tenantId !== tenantId) throw new Error("APPLICATION_NOT_FOUND");
    return { ...record };
  }

  list(tenantId: string): ApplicationRecord[] {
    if (!tenantId?.trim()) throw new Error("APPLICATION_SCOPE_REQUIRED");
    return [...this.records.values()]
      .filter((record) => record.tenantId === tenantId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.applicationId.localeCompare(b.applicationId))
      .map((record) => ({ ...record }));
  }

  update(tenantId: string, applicationId: string, input: UpdateApplicationInput): ApplicationRecord {
    const current = this.get(tenantId, applicationId);
    const name = input.name === undefined ? current.name : input.name.trim();
    if (!name) throw new Error("APPLICATION_NAME_REQUIRED");

    if (input.lifecycle !== undefined &&
      !["DRAFT", "ACTIVE", "SUSPENDED", "ARCHIVED"].includes(input.lifecycle)) {
      throw new Error("APPLICATION_LIFECYCLE_INVALID");
    }

    const updated: ApplicationRecord = {
      ...current,
      name,
      ...(input.lifecycle === undefined ? {} : { lifecycle: input.lifecycle }),
      updatedAt: this.clock().toISOString(),
      version: current.version + 1,
    };
    this.records.set(applicationId, updated);
    return { ...updated };
  }

  private key(tenantId: string, slug: string): string {
    return `${tenantId.length}:${tenantId}:${slug}`;
  }
}
