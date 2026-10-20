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
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.commit([]);
    }
  }

  private validRow(value: unknown): value is ReportRow {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const row = value as ReportRow;
    return typeof row.tenantId === "string" && !!row.tenantId.trim() &&
      typeof row.reportId === "string" && !!row.reportId.trim() &&
      typeof row.generatedAt === "string" && !Number.isNaN(Date.parse(row.generatedAt)) &&
      !!row.values && typeof row.values === "object" && !Array.isArray(row.values) &&
      Array.isArray(row.sourceRequirementIds) && row.sourceRequirementIds.length > 0 &&
      row.sourceRequirementIds.every(id => typeof id === "string" && !!id.trim());
  }

  private read(): ReportRow[] {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, "utf8"));
      if (!Array.isArray(parsed) || !parsed.every(row => this.validRow(row))) throw new Error();
      return parsed as ReportRow[];
    } catch { throw new Error("PERSISTENCE_DATA_INVALID"); }
  }

  private commit(rows: ReportRow[]): void {
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(rows), { encoding: "utf8", mode: 0o600, flag: "wx" });
    renameSync(temporary, this.filePath);
  }

  private clone<T>(value: T): T {
    try {
      const serialized = JSON.stringify(value);
      if (serialized === undefined) throw new Error();
      return JSON.parse(serialized) as T;
    } catch { throw new Error("REPORT_DATA_NOT_SERIALIZABLE"); }
  }

  publish(row: ReportRow): void {
    if (!row || typeof row !== "object" ||
      typeof row.tenantId !== "string" || !row.tenantId.trim() ||
      typeof row.reportId !== "string" || !row.reportId.trim() ||
      typeof row.generatedAt !== "string" || !row.generatedAt.trim()) {
      throw new Error("REPORT_CONTEXT_REQUIRED");
    }
    if (Number.isNaN(Date.parse(row.generatedAt))) throw new Error("REPORT_TIMESTAMP_INVALID");
    if (!row.values || typeof row.values !== "object" || Array.isArray(row.values)) {
      throw new Error("REPORT_VALUES_INVALID");
    }
    if (!Array.isArray(row.sourceRequirementIds) ||
      row.sourceRequirementIds.some(id => typeof id !== "string" || !id.trim())) {
      throw new Error("REPORT_PROVENANCE_INVALID");
    }
    if (row.sourceRequirementIds.length === 0) throw new Error("REPORT_PROVENANCE_REQUIRED");
    const stored = this.clone(row);
    const rows = this.read();
    rows.push(stored);
    this.commit(rows);
  }

  query(request: ReportQuery): readonly ReportRow[] {
    if (!request || typeof request !== "object" || Array.isArray(request) ||
      typeof request.tenantId !== "string" || !request.tenantId.trim() ||
      typeof request.reportId !== "string" || !request.reportId.trim()) {
      throw new Error("REPORT_QUERY_CONTEXT_REQUIRED");
    }
    if (request.filters !== undefined &&
      (!request.filters || typeof request.filters !== "object" || Array.isArray(request.filters))) {
      throw new Error("REPORT_FILTERS_INVALID");
    }
    const limit = request.limit ?? 100;
    if (!Number.isInteger(limit) || limit <= 0) throw new Error("REPORT_LIMIT_INVALID");
    return this.read()
      .filter(row => row.tenantId === request.tenantId && row.reportId === request.reportId &&
        Object.entries(request.filters ?? {}).every(([key, value]) => row.values[key] === value))
      .slice(0, limit)
      .map(row => this.clone(row));
  }
}
