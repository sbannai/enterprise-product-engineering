export const STATES=Object.freeze({DRAFT:"DRAFT",ALLOCATED:"ALLOCATED",FULFILLED:"FULFILLED",CANCELLED:"CANCELLED",RETURNED:"RETURNED"});
export class ValidationError extends Error {}
export class AuthorizationError extends Error {}
const transitions={
  DRAFT:new Set(["ALLOCATED","CANCELLED"]),
  ALLOCATED:new Set(["FULFILLED","CANCELLED"]),
  FULFILLED:new Set(["RETURNED"]),
  CANCELLED:new Set([]),
  RETURNED:new Set([])
};
function authorize(ctx,tenantId,permission){
  if(!ctx?.tenantId||ctx.tenantId!==tenantId) throw new AuthorizationError("Tenant context denied");
  if(!ctx.permissions?.includes(permission)) throw new AuthorizationError("Permission denied");
}
export class OrderRepository{
  constructor(){this.orders=new Map();}
  create(ctx,input){
    authorize(ctx,input.tenantId,"order:write");
    if(!input.orderNumber||!Array.isArray(input.lines)||input.lines.length===0) throw new ValidationError("Order number and at least one line are required");
    if(input.lines.some(x=>!x.sku||!Number.isInteger(x.quantity)||x.quantity<=0)) throw new ValidationError("Order lines require valid SKU and positive quantity");
    const id=input.id??`ord-${this.orders.size+1}`;
    const order={id,tenantId:input.tenantId,orderNumber:input.orderNumber,lines:structuredClone(input.lines),status:STATES.DRAFT,version:1,history:[{action:"CREATE",status:STATES.DRAFT,at:new Date().toISOString()}]};
    this.orders.set(id,order); return structuredClone(order);
  }
  transition(ctx,id,nextStatus,reason){
    const order=this.orders.get(id); if(!order) throw new ValidationError("Order not found");
    authorize(ctx,order.tenantId,"order:transition");
    if(!reason||reason.length<3) throw new ValidationError("Transition reason is required");
    if(!transitions[order.status]?.has(nextStatus)) throw new ValidationError(`Invalid order transition ${order.status} -> ${nextStatus}`);
    order.status=nextStatus; order.version++;
    order.history.push({action:"STATUS_CHANGE",status:nextStatus,reason,at:new Date().toISOString()});
    return structuredClone(order);
  }
  get(ctx,id){
    const order=this.orders.get(id); if(!order) throw new ValidationError("Order not found");
    authorize(ctx,order.tenantId,"order:read"); return structuredClone(order);
  }
  list(ctx,tenantId){
    authorize(ctx,tenantId,"order:read");
    return [...this.orders.values()].filter(x=>x.tenantId===tenantId).map(structuredClone);
  }
}
export function validateMaterialChange(order,{allocationConfirmed,pricingConfirmed}){
  if(order.status==="DRAFT"&&(!allocationConfirmed||!pricingConfirmed)) throw new ValidationError("Allocation and pricing confirmation are required before material fulfillment processing");
  return true;
}
export function audit(event,actor,resourceId){return {event,actorId:actor.actorId,tenantId:actor.tenantId,resourceId,at:new Date().toISOString()};}
export function controlledException(code,message,context={}){return {code,message,context,governed:true,at:new Date().toISOString()};}
export function report(ctx,repo,tenantId){
  authorize(ctx,tenantId,"order:report");
  const orders=repo.list(ctx,tenantId);
  return {tenantId,totalOrders:orders.length,byStatus:Object.fromEntries(Object.values(STATES).map(s=>[s,orders.filter(o=>o.status===s).length])),totalLines:orders.reduce((n,o)=>n+o.lines.length,0)};
}
