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
    if (!row || typeof row !== "object" || Array.isArray(row) ||
        typeof row.tenantId !== "string" || !row.tenantId.trim() ||
        typeof row.reportId !== "string" || !row.reportId.trim() ||
        typeof row.generatedAt !== "string" || !row.generatedAt.trim()) {
      throw new Error("REPORT_CONTEXT_REQUIRED");
    }
    if (!Array.isArray(row.sourceRequirementIds) ||
        row.sourceRequirementIds.length === 0 ||
        !row.sourceRequirementIds.every((id) => typeof id === "string" && id.trim().length > 0)) {
      throw new Error("REPORT_PROVENANCE_REQUIRED");
    }
    if (new Set(row.sourceRequirementIds).size !== row.sourceRequirementIds.length) {
      throw new Error("REPORT_PROVENANCE_DUPLICATE");
    }
    if (!row.values || typeof row.values !== "object" || Array.isArray(row.values)) {
      throw new Error("REPORT_VALUES_INVALID");
    }
    if (Number.isNaN(Date.parse(row.generatedAt))) {
      throw new Error("REPORT_TIMESTAMP_INVALID");
    }
    // Validate serialization before committing a row so rejected reports never partially enter storage.
    const stored = this.cloneRow(row);
    this.rows.push(stored);
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
    if (!Number.isSafeInteger(limit) || limit <= 0) {
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
