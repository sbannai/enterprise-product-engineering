export const STATES=Object.freeze({DRAFT:"DRAFT",ACTIVE:"ACTIVE",SUSPENDED:"SUSPENDED",COMPLETED:"COMPLETED",CANCELLED:"CANCELLED"});
export class ValidationError extends Error{constructor(message){super(message);this.name="ValidationError"}}
export class AuthorizationError extends Error{constructor(message){super(message);this.name="AuthorizationError"}}
const transitions=Object.freeze({DRAFT:new Set(["ACTIVE","CANCELLED"]),ACTIVE:new Set(["SUSPENDED","COMPLETED","CANCELLED"]),SUSPENDED:new Set(["ACTIVE","CANCELLED"]),COMPLETED:new Set(),CANCELLED:new Set()});
function authorize(ctx,p){if(!ctx?.tenantId||!ctx.permissions?.includes(p))throw new AuthorizationError("Authorization denied")}
export class RecordRepository{
 #records=new Map();
 create(ctx,input){authorize(ctx,"record:create");if(!input?.reference||!input?.category)throw new ValidationError("reference and category are required");const id=crypto.randomUUID(),now=new Date().toISOString();const r={id,tenantId:ctx.tenantId,reference:input.reference,category:input.category,state:STATES.DRAFT,version:1,history:[{state:STATES.DRAFT,at:now,actor:ctx.principalId??"system"}]};this.#records.set(id,r);return structuredClone(r)}
 transition(ctx,id,next,reason){authorize(ctx,"record:transition");if(!reason||reason.trim().length<3)throw new ValidationError("transition reason required");const r=this.#records.get(id);if(!r||r.tenantId!==ctx.tenantId)throw new AuthorizationError("Record is not accessible");if(!transitions[r.state]?.has(next))throw new ValidationError(`Invalid transition ${r.state} -> ${next}`);r.state=next;r.version++;r.history.push({state:next,reason,at:new Date().toISOString(),actor:ctx.principalId??"system"});return structuredClone(r)}
 list(ctx){authorize(ctx,"record:read");return [...this.#records.values()].filter(r=>r.tenantId===ctx.tenantId).map(r=>structuredClone(r))}
}
export function validateMaterialChange(record,{approvalConfirmed,preconditionsMet}={}){if(!record||!approvalConfirmed||!preconditionsMet)throw new ValidationError("Mandatory material-change conditions are not satisfied");return true}
export function audit(event,actor,resourceId){if(!event||!actor||!resourceId)throw new ValidationError("Audit event requires event, actor and resource");return Object.freeze({event,actor,resourceId,at:new Date().toISOString()})}
export function controlledException(code,message,context={}){if(!code||!message)throw new ValidationError("Exception code and message are required");return Object.freeze({code,message,context:structuredClone(context),createdAt:new Date().toISOString(),status:"OPEN"})}
export function report(ctx,repo){authorize(ctx,"report:read");return repo.list(ctx).reduce((s,r)=>{s.total++;s.byState[r.state]=(s.byState[r.state]??0)+1;return s},{total:0,byState:{}})}
