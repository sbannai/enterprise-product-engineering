export type ValidationSeverity = "ERROR" | "WARNING";

export interface ValidationIssue {
  code: string;
  message: string;
  severity: ValidationSeverity;
}

export interface ValidationRule<T> {
  id: string;
  evaluate(input: T): ValidationIssue | null;
}

export interface ValidationResult {
  valid: boolean;
  issues: readonly ValidationIssue[];
}

export class BusinessValidationEngine<T> {
  private readonly rules: ValidationRule<T>[] = [];

  addRule(rule: ValidationRule<T>): void {
    if (!rule || typeof rule !== "object" || Array.isArray(rule) ||
        typeof rule.id !== "string" || !rule.id.trim() ||
        typeof rule.evaluate !== "function") {
      throw new Error("VALIDATION_RULE_INVALID");
    }
    if (this.rules.some((existing) => existing.id === rule.id)) {
      throw new Error("VALIDATION_RULE_DUPLICATE");
    }
    this.rules.push(rule);
  }

  validate(input: T): ValidationResult {
    const issues: ValidationIssue[] = [];
    for (const rule of this.rules) {
      const issue: unknown = rule.evaluate(input);
      if (issue === null) continue;
      if (!issue || typeof issue !== "object" || Array.isArray(issue)) {
        throw new Error(`VALIDATION_ISSUE_INVALID:${rule.id}`);
      }
      const candidate = issue as Partial<ValidationIssue>;
      if (typeof candidate.code !== "string" || !candidate.code.trim() ||
          typeof candidate.message !== "string" || !candidate.message.trim() ||
          (candidate.severity !== "ERROR" && candidate.severity !== "WARNING")) {
        throw new Error(`VALIDATION_ISSUE_INVALID:${rule.id}`);
      }
      issues.push({
        code: candidate.code,
        message: candidate.message,
        severity: candidate.severity,
      });
    }

    return {
      valid: !issues.some((issue) => issue.severity === "ERROR"),
      issues,
    };
  }
}
