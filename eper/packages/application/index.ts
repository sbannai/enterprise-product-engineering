export interface TrustedContext { principalId: string; tenantId: string; correlationId: string; }
export interface ApplicationService<C,O> { execute(command: C, context: TrustedContext): Promise<O>; }
