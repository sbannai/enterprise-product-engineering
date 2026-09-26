export const STATES = Object.freeze({
  AVAILABLE: "AVAILABLE", RESERVED: "RESERVED", QUARANTINED: "QUARANTINED", DEPLETED: "DEPLETED"
});
export class ValidationError extends Error {}
export class AuthorizationError extends Error {}
const TRANSITIONS = {
  AVAILABLE: new Set(["RESERVED","QUARANTINED","DEPLETED"]),
  RESERVED: new Set(["AVAILABLE","QUARANTINED","DEPLETED"]),
  QUARANTINED: new Set(["AVAILABLE","DEPLETED"]),
  DEPLETED: new Set([])
};
function authorize(ctx, tenantId, permission) {
  if (!ctx?.tenantId || ctx.tenantId !== tenantId) throw new AuthorizationError("Tenant context denied");
  if (!ctx.permissions?.includes(permission)) throw new AuthorizationError("Permission denied");
}
export class InventoryRepository {
  constructor(){ this.items=new Map(); }
  create(ctx,input){
    authorize(ctx,input.tenantId,"inventory:write");
    if(!input.sku||!input.locationId||!Number.isInteger(input.quantity)||input.quantity<0) throw new ValidationError("SKU, location and non-negative quantity are required");
    const id=input.id??`inv-${this.items.size+1}`;
    const state=input.quantity===0?STATES.DEPLETED:STATES.AVAILABLE;
    const record={id,tenantId:input.tenantId,sku:input.sku,locationId:input.locationId,quantity:input.quantity,state,version:1,lifecycleHistory:[{action:"CREATE",state,at:new Date().toISOString()}]};
    this.items.set(id,record); return structuredClone(record);
  }
  transition(ctx,id,nextState,reason){
    const current=this.items.get(id); if(!current) throw new ValidationError("Inventory record not found");
    authorize(ctx,current.tenantId,"inventory:transition");
    if(!reason||reason.length<3) throw new ValidationError("Transition reason is required");
    if(!TRANSITIONS[current.state]?.has(nextState)) throw new ValidationError(`Invalid inventory transition ${current.state} -> ${nextState}`);
    current.state=nextState; current.version++;
    current.lifecycleHistory.push({action:"STATE_CHANGE",state:nextState,reason,at:new Date().toISOString()});
    return structuredClone(current);
  }
  adjust(ctx,id,quantity,reason){
    const current=this.items.get(id); if(!current) throw new ValidationError("Inventory record not found");
    authorize(ctx,current.tenantId,"inventory:adjust");
    if(!Number.isInteger(quantity)||quantity<0||!reason||reason.length<3) throw new ValidationError("Valid quantity and adjustment reason are required");
    current.quantity=quantity; current.state=quantity===0?STATES.DEPLETED:(current.state===STATES.DEPLETED?STATES.AVAILABLE:current.state); current.version++;
    current.lifecycleHistory.push({action:"ADJUST",quantity,reason,at:new Date().toISOString()}); return structuredClone(current);
  }
  get(ctx,id){ const current=this.items.get(id); if(!current) throw new ValidationError("Inventory record not found"); authorize(ctx,current.tenantId,"inventory:read"); return structuredClone(current); }
  list(ctx,tenantId){ authorize(ctx,tenantId,"inventory:read"); return [...this.items.values()].filter(x=>x.tenantId===tenantId).map(structuredClone); }
}
export function audit(event,actor){ return {event,actorId:actor.actorId,tenantId:actor.tenantId,at:new Date().toISOString()}; }
export function controlledException(code,message,context={}){ return {code,message,context,governed:true,at:new Date().toISOString()}; }
export function report(ctx,repository,tenantId){
  authorize(ctx,tenantId,"inventory:report"); const records=repository.list(ctx,tenantId);
  return {tenantId,totalRecords:records.length,byState:Object.fromEntries(Object.values(STATES).map(s=>[s,records.filter(r=>r.state===s).length])),totalQuantity:records.reduce((sum,r)=>sum+r.quantity,0)};
}
