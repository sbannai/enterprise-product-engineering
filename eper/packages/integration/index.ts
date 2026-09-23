export interface IntegrationOutcome<T=unknown>{success:boolean;value?:T;retryable?:boolean;externalReference?:string;}
export interface IntegrationPort<I,O>{invoke(request:I,correlationId:string):Promise<IntegrationOutcome<O>>;}
