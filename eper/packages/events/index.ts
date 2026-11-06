export interface EventEnvelope<T=unknown>{eventId:string;eventType:string;eventVersion:number;occurredAt:string;producer:string;tenantId?:string;aggregateId?:string;correlationId:string;causationId?:string;payload:T;}
export interface EventPublisher { publish<T>(event:EventEnvelope<T>):Promise<void>; }
