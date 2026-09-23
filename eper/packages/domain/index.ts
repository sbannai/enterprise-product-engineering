export interface DomainObject { id: string; version: number; tenantId: string; }
export interface Repository<T extends DomainObject> { load(id: string, tenantId: string): Promise<T|null>; save(entity:T, expectedVersion:number): Promise<T>; }
