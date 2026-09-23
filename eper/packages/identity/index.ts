export interface PrincipalContext { principalId: string; authenticated: boolean; correlationId: string; claims: Record<string, unknown>; }
export interface IdentityProvider { authenticate(token: string): Promise<PrincipalContext>; }
