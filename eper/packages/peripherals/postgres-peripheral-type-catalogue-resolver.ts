import type { AuditSqlPool } from "../audit/audit-event-store.js";
import { acquirePeripheralCatalogueTypeLock } from "./peripheral-type-catalogue-lock.js";

export interface PublishedPeripheralSchema {
  typeKey: string;
  schemaVersion: number;
  adapterKey: string;
  adapterVersion: string;
  configurationSchema: Record<string, unknown>;
  compatibility: Record<string, unknown>;
}

type Row = {
  type_key: string;
  schema_version: number | string;
  adapter_key: string;
  adapter_version: string;
  configuration_schema: Record<string, unknown> | string;
  compatibility: Record<string, unknown> | string;
};

const decode = <T>(value: T | string): T =>
  typeof value === "string" ? JSON.parse(value) as T : value;

export class PostgresPeripheralTypeCatalogueResolver {
  constructor(private readonly pool: AuditSqlPool) {}

  async withPublishedSchema<T>(
    typeKey: string,
    schemaVersion: number,
    operation: (published: PublishedPeripheralSchema | null) => Promise<T>,
  ): Promise<T> {
    if (
      typeof typeKey !== "string" ||
      !/^[a-z][a-z0-9_.-]{1,95}$/.test(typeKey) ||
      !Number.isSafeInteger(schemaVersion) ||
      schemaVersion < 1
    ) {
      throw new Error("PERIPHERAL_CATALOGUE_SCHEMA_REFERENCE_INVALID");
    }

    const client = await this.pool.connect();

    try {
      await client.query("BEGIN READ ONLY");
      await client.query(
        "SET LOCAL ROLE eper_peripheral_type_catalogue_read_access",
      );

      // Held until the configuration callback finishes and this transaction commits.
      // Publication and type deprecation acquire the matching exclusive lock.
      await acquirePeripheralCatalogueTypeLock(client, typeKey, "shared");

      const result = await client.query<Row>(
        `SELECT
           s.type_key,
           s.schema_version,
           s.adapter_key,
           s.adapter_version,
           s.configuration_schema,
           s.compatibility
         FROM eper_peripheral_type_schema_versions s
         JOIN eper_peripheral_type_schema_lifecycle l
           ON l.type_key = s.type_key
          AND l.schema_version = s.schema_version
         WHERE s.type_key = $1
           AND s.schema_version = $2
           AND l.lifecycle_status = 'PUBLISHED'
         LIMIT 1`,
        [typeKey, schemaVersion],
      );

      const row = result.rows[0];
      const published = row ? {
        typeKey: row.type_key,
        schemaVersion: Number(row.schema_version),
        adapterKey: row.adapter_key,
        adapterVersion: row.adapter_version,
        configurationSchema: decode(row.configuration_schema),
        compatibility: decode(row.compatibility),
      } : null;

      const value = await operation(published);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}
