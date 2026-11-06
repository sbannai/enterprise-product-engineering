export type ErrorClass="Validation"|"Authorization"|"BusinessRule"|"Concurrency"|"TransientDependency"|"PermanentIntegration"|"SystemFailure";
export class DomainError extends Error { constructor(public readonly errorClass:ErrorClass, public readonly code:string, message:string, public readonly retryable=false){super(message);} }
