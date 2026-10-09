import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ReportQuery, ReportRow } from "./governed-reporting.js";

/** Local JSON-file adapter for isolated UAT. Not safe for concurrent multi-process writers. */
export class JsonFileGovernedReportingStore {
  constructor(private readonly filePath: string) {
    if (!filePath?.trim()) throw new Error("PERSISTENCE_PATH_REQUIRED");
    mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
    try { readFileSync(filePath, "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; this.commit([]); }
  }
  private read(): ReportRow[] {
    try { const parsed: unknown=JSON.parse(readFileSync(this.filePath,"utf8")); if(!Array.isArray(parsed)) throw new Error(); return parsed as ReportRow[]; }
    catch { throw new Error("PERSISTENCE_DATA_INVALID"); }
  }
  private commit(rows: ReportRow[]): void {
    const temporary=`${this.filePath}.${randomUUID()}.tmp`;
    writeFileSync(temporary,JSON.stringify(rows),{encoding:"utf8",mode:0o600,flag:"wx"}); renameSync(temporary,this.filePath);
  }
  private clone<T>(value:T):T {
    try { const serialized=JSON.stringify(value); if(serialized===undefined) throw new Error(); return JSON.parse(serialized) as T; }
    catch { throw new Error("REPORT_DATA_NOT_SERIALIZABLE"); }
  }
  publish(row: ReportRow): void {
    if(!row.tenantId||!row.reportId||!row.generatedAt) throw new Error("REPORT_CONTEXT_REQUIRED");
    if(!row.sourceRequirementIds?.length) throw new Error("REPORT_PROVENANCE_REQUIRED");
    const rows=this.read(); rows.push(this.clone(row)); this.commit(rows);
  }
  query(request: ReportQuery): readonly ReportRow[] {
    if(!request.tenantId||!request.reportId) throw new Error("REPORT_QUERY_CONTEXT_REQUIRED");
    const limit=request.limit??100; if(!Number.isInteger(limit)||limit<=0) throw new Error("REPORT_LIMIT_INVALID");
    return this.read().filter(row=>row.tenantId===request.tenantId&&row.reportId===request.reportId&&Object.entries(request.filters??{}).every(([key,value])=>row.values[key]===value)).slice(0,limit).map(row=>this.clone(row));
  }
}
