export interface RuleOutcome { allowed: boolean; code?: string; details?: Record<string, unknown>; }
export interface DecisionRule<I> { evaluate(input:I): Promise<RuleOutcome>; }
