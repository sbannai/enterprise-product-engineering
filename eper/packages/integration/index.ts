export interface IntegrationOutcome<T=unknown>{success:boolean;value?:T;retryable?:boolean;definitiveRejection?:boolean;rejectionCode?:string;externalReference?:string;}

/**
 * Provider-neutral invocation boundary. AbortSignal is optional so existing
 * integrations remain source-compatible; cancellable adapters must forward it
 * to their underlying SDK/transport and settle after cancellation.
 */
export interface IntegrationPort<I,O>{
  invoke(request:I,correlationId:string,operationId?:string,signal?:AbortSignal):Promise<IntegrationOutcome<O>>;
}
