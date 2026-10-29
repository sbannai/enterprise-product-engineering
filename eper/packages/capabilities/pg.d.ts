declare module "pg" {
  export type QueryResultRow = Record<string, unknown>;
  export interface QueryResult<R extends QueryResultRow = QueryResultRow> {
    command?: string;
    rowCount: number | null;
    oid?: number;
    fields?: unknown[];
    rows: R[];
  }
  export interface PoolClient {
    query<R extends QueryResultRow = QueryResultRow>(queryText: string, values?: readonly unknown[]): Promise<QueryResult<R>>;
    release(err?: Error | boolean): void;
  }
  export interface Pool {
    connect(): Promise<PoolClient>;
    query<R extends QueryResultRow = QueryResultRow>(queryText: string, values?: readonly unknown[]): Promise<QueryResult<R>>;
    end(): Promise<void>;
  }
  export interface PoolConfig {
    connectionString?: string;
    max?: number;
    connectionTimeoutMillis?: number;
    [key: string]: unknown;
  }
  const pg: { Pool: new (config?: PoolConfig) => Pool };
  export default pg;
}
