export const STATES=Object.freeze({PLANNED:"PLANNED",TENDERED:"TENDERED",IN_TRANSIT:"IN_TRANSIT",DELIVERED:"DELIVERED",CANCELLED:"CANCELLED",CLAIMED:"CLAIMED"});
export class ValidationError extends Error{}
export class AuthorizationError extends Error{}
const transitions={PLANNED:new Set(["TENDERED","CANCELLED"]),TENDERED:new Set(["IN_TRANSIT","CANCELLED"]),IN_TRANSIT:new Set(["DELIVERED","CLAIMED"]),DELIVERED:new Set(["CLAIMED"]),CANCELLED:new Set([]),CLAIMED:new Set([])};
function authorize(ctx,tenantId,p){if(!ctx?.tenantId||ctx.tenantId!==tenantId)throw new AuthorizationError("Tenant context denied");if(!ctx.permissions?.includes(p))throw new AuthorizationError("Permission denied")}
export class LogisticsRepository{
 constructor(){this.shipments=new Map()}
 create(ctx,input){authorize(ctx,input.tenantId,"logistics:write");if(!input.transportOrder||!input.carrier||!input.destination)throw new ValidationError("Transport order, carrier and destination are required");const id=input.id??`ship-${this.shipments.size+1}`;const s={id,tenantId:input.tenantId,transportOrder:input.transportOrder,carrier:input.carrier,destination:input.destination,status:STATES.PLANNED,version:1,history:[{action:"CREATE",status:STATES.PLANNED,at:new Date().toISOString()}]};this.shipments.set(id,s);return structuredClone(s)}
 transition(ctx,id,next,reason){const s=this.shipments.get(id);if(!s)throw new ValidationError("Shipment not found");authorize(ctx,s.tenantId,"logistics:transition");if(!reason||reason.length<3)throw new ValidationError("Transition reason is required");if(!transitions[s.status]?.has(next))throw new ValidationError(`Invalid logistics transition ${s.status} -> ${next}`);s.status=next;s.version++;s.history.push({action:"STATUS_CHANGE",status:next,reason,at:new Date().toISOString()});return structuredClone(s)}
 get(ctx,id){const s=this.shipments.get(id);if(!s)throw new ValidationError("Shipment not found");authorize(ctx,s.tenantId,"logistics:read");return structuredClone(s)}
 list(ctx,tenantId){authorize(ctx,tenantId,"logistics:read");return [...this.shipments.values()].filter(x=>x.tenantId===tenantId).map(structuredClone)}
}
export function validateMaterialAction(shipment,{carrierConfirmed,routeApproved}){if(shipment.status==="PLANNED"&&(!carrierConfirmed||!routeApproved))throw new ValidationError("Carrier and route approval are required before tender");return true}
export function audit(event,actor,resourceId){return{event,actorId:actor.actorId,tenantId:actor.tenantId,resourceId,at:new Date().toISOString()}}
export function controlledException(code,message,context={}){return{code,message,context,governed:true,at:new Date().toISOString()}}
export function report(ctx,repo,tenantId){authorize(ctx,tenantId,"logistics:report");const rows=repo.list(ctx,tenantId);return{tenantId,totalShipments:rows.length,byStatus:Object.fromEntries(Object.values(STATES).map(s=>[s,rows.filter(x=>x.status===s).length])),carriers:[...new Set(rows.map(x=>x.carrier))]}}
