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

  publish(row: ReportRow): void {
    if (!row.tenantId || !row.reportId || !row.generatedAt) {
      throw new Error("REPORT_CONTEXT_REQUIRED");
    }
    if (row.sourceRequirementIds.length === 0) {
      throw new Error("REPORT_PROVENANCE_REQUIRED");
    }
    this.rows.push({
      ...row,
      values: { ...row.values },
      sourceRequirementIds: [...row.sourceRequirementIds],
    });
  }

  query(request: ReportQuery): readonly ReportRow[] {
    if (!request.tenantId || !request.reportId) {
      throw new Error("REPORT_QUERY_CONTEXT_REQUIRED");
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

    return matches.slice(0, limit).map((row) => ({
      ...row,
      values: { ...row.values },
      sourceRequirementIds: [...row.sourceRequirementIds],
    }));
  }
}
