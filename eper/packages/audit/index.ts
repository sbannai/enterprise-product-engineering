export interface AuditEvent { actorId:string;tenantId?:string;action:string;resource:string;resourceId?:string;occurredAt:string;correlationId:string;outcome:string; }
export interface AuditPort { record(event:AuditEvent):Promise<void>; }
