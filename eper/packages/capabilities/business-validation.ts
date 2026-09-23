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
    if (!rule.id || typeof rule.evaluate !== "function") {
      throw new Error("VALIDATION_RULE_INVALID");
    }
    if (this.rules.some((existing) => existing.id === rule.id)) {
      throw new Error("VALIDATION_RULE_DUPLICATE");
    }
    this.rules.push(rule);
  }

  validate(input: T): ValidationResult {
    const issues = this.rules
      .map((rule) => rule.evaluate(input))
      .filter((issue): issue is ValidationIssue => issue !== null);

    return {
      valid: !issues.some((issue) => issue.severity === "ERROR"),
      issues,
    };
  }
}
