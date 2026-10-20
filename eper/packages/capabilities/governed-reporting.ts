export interface ReportRow {
  tenantId: string;
  reportId: string;
  values: Record<string, unknown>;
  sourceRequirementIds: readonly string[];
  generatedAt: string;
}

export interface ReportQuery {
  tenantId: string;
  reportId: string;
  filters?: Record<string, unknown>;
  limit?: number;
}

export class InMemoryGovernedReportingService {
  private readonly rows: ReportRow[] = [];

  private cloneJson<T>(value: T): T {
    try {
      const serialized = JSON.stringify(value);
      if (serialized === undefined) throw new Error("REPORT_DATA_NOT_SERIALIZABLE");
      return JSON.parse(serialized) as T;
    } catch {
      throw new Error("REPORT_DATA_NOT_SERIALIZABLE");
    }
  }

  private cloneRow(row: ReportRow): ReportRow {
    return {
      ...row,
      values: this.cloneJson(row.values),
      sourceRequirementIds: [...row.sourceRequirementIds],
    };
  }

  publish(row: ReportRow): void {
    if (!row || typeof row !== "object" ||
      typeof row.tenantId !== "string" || !row.tenantId.trim() ||
      typeof row.reportId !== "string" || !row.reportId.trim() ||
      typeof row.generatedAt !== "string" || !row.generatedAt.trim()) {
      throw new Error("REPORT_CONTEXT_REQUIRED");
    }
    if (Number.isNaN(Date.parse(row.generatedAt))) {
      throw new Error("REPORT_TIMESTAMP_INVALID");
    }
    if (!row.values || typeof row.values !== "object" || Array.isArray(row.values)) {
      throw new Error("REPORT_VALUES_INVALID");
    }
    if (!Array.isArray(row.sourceRequirementIds) ||
      row.sourceRequirementIds.some((id) => typeof id !== "string" || !id.trim())) {
      throw new Error("REPORT_PROVENANCE_INVALID");
    }
    if (row.sourceRequirementIds.length === 0) {
      throw new Error("REPORT_PROVENANCE_REQUIRED");
    }
    this.rows.push(this.cloneRow(row));
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
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error("REPORT_LIMIT_INVALID");
    }

    const matches = this.rows.filter((row) => {
      if (row.tenantId !== request.tenantId || row.reportId !== request.reportId) return false;
      return Object.entries(request.filters ?? {}).every(
        ([key, value]) => row.values[key] === value,
      );
    });

    return matches.slice(0, limit).map((row) => this.cloneRow(row));
  }
}
