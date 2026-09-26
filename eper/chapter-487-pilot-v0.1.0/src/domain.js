export const STATES=Object.freeze({DRAFT:"DRAFT",ACTIVE:"ACTIVE",SUSPENDED:"SUSPENDED",COMPLETED:"COMPLETED",CANCELLED:"CANCELLED"});
export class AuthorizationError extends Error{constructor(message="Forbidden"){super(message);this.name="AuthorizationError";}}
export class ValidationError extends Error{constructor(message){super(message);this.name="ValidationError";}}
const transitions={DRAFT:new Set(["ACTIVE","CANCELLED"]),ACTIVE:new Set(["SUSPENDED","COMPLETED","CANCELLED"]),SUSPENDED:new Set(["ACTIVE","CANCELLED"]),COMPLETED:new Set(),CANCELLED:new Set()};
export class RecordRepository{
 constructor(){this.records=new Map();this.auditLog=[];}
 #authorize(ctx,p,t){if(!ctx?.principalId||ctx.tenantId!==t||!ctx.permissions?.includes(p))throw new AuthorizationError();}
 create(ctx,{id,tenantId,reference,category}){this.#authorize(ctx,"record:create",tenantId);if(!id||!reference||!category)throw new ValidationError("reference and category are required");if(this.records.has(id))throw new ValidationError("record already exists");const r={id,tenantId,reference,category,state:STATES.DRAFT,history:[{from:null,to:STATES.DRAFT,actor:ctx.principalId,at:new Date().toISOString()}]};this.records.set(id,r);this.audit("RECORD_CREATED",ctx,id);return structuredClone(r);}
 get(ctx,id){const r=this.records.get(id);if(!r||r.tenantId!==ctx?.tenantId)throw new AuthorizationError();this.#authorize(ctx,"record:read",r.tenantId);return structuredClone(r);}
 transition(ctx,id,to,reason){const r=this.records.get(id);if(!r||r.tenantId!==ctx?.tenantId)throw new AuthorizationError();this.#authorize(ctx,"record:transition",r.tenantId);if(!transitions[r.state]?.has(to))throw new ValidationError("invalid lifecycle transition");if(!reason)throw new ValidationError("transition reason is required");const from=r.state;r.state=to;r.history.push({from,to,reason,actor:ctx.principalId,at:new Date().toISOString()});this.audit("STATE_CHANGED",ctx,id,{from,to,reason});return structuredClone(r);}
 validateMaterialChange(input){if(!input?.approvalConfirmed||!input?.preconditionsMet)throw new ValidationError("approval and mandatory preconditions are required");return true;}
 audit(event,ctx,resourceId,details={}){this.auditLog.push({event,principalId:ctx?.principalId,tenantId:ctx?.tenantId,resourceId,at:new Date().toISOString(),details});}
 controlledException(code,message,ctx,resourceId){if(!code||!message)throw new ValidationError("exception code and message are required");this.audit("CONTROLLED_EXCEPTION",ctx,resourceId,{code,message});return {code,message,status:"OPEN"};}
 report(ctx){this.#authorize(ctx,"report:read",ctx.tenantId);return [...this.records.values()].filter(r=>r.tenantId===ctx.tenantId).reduce((a,r)=>(a[r.state]=(a[r.state]||0)+1,a),{});}
}