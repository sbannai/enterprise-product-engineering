class ValidationError extends Error{constructor(m){super(m);this.name='ValidationError'}}
class AuthorizationError extends Error{constructor(m){super(m);this.name='AuthorizationError'}}
const STATES=['PROSPECTIVE','QUALIFIED','ACTIVE','SUSPENDED','RESTRICTED','INACTIVE'];
const TRANSITIONS={PROSPECTIVE:['QUALIFIED','INACTIVE'],QUALIFIED:['ACTIVE','INACTIVE'],ACTIVE:['SUSPENDED','RESTRICTED','INACTIVE'],SUSPENDED:['ACTIVE','INACTIVE'],RESTRICTED:['ACTIVE','INACTIVE'],INACTIVE:[]};
function tenant(ctx,id){if(!ctx?.tenantIds?.includes(id))throw new AuthorizationError('Tenant access denied')}
function auth(ctx,p){if(!ctx?.authenticated)throw new AuthorizationError('Authentication required');if(!ctx.permissions?.includes(p))throw new AuthorizationError('Permission denied')}
class SupplierRepository{constructor(){this.items=new Map();this.audit=[]}
 create(ctx,s){tenant(ctx,s.tenantId);if(!s.id||!s.name)throw new ValidationError('id and name are required');if(!STATES.includes(s.status))throw new ValidationError('invalid supplier state');if(this.items.has(s.id))throw new ValidationError('supplier already exists');const x={...s,version:1,lifecycleHistory:[{from:null,to:s.status}]};this.items.set(s.id,x);return structuredClone(x)}
 transition(ctx,id,to,reason){const s=this.items.get(id);if(!s)throw new Error('not found');tenant(ctx,s.tenantId);auth(ctx,'supplier:transition');if(!TRANSITIONS[s.status]?.includes(to))throw new ValidationError('invalid lifecycle transition');if(!reason||reason.trim().length<3)throw new ValidationError('transition reason required');const x={...s,status:to,version:s.version+1,lifecycleHistory:[...s.lifecycleHistory,{from:s.status,to,reason}]};this.items.set(id,x);return structuredClone(x)}
 get(ctx,id){const s=this.items.get(id);if(!s)return null;tenant(ctx,s.tenantId);return structuredClone(s)}
 list(ctx){return [...this.items.values()].filter(s=>ctx.tenantIds.includes(s.tenantId)).sort((a,b)=>a.id.localeCompare(b.id)).map(structuredClone)}}
function audit(a,ctx,action,id,outcome){a.push({id:'AUD-'+(a.length+1),tenantId:ctx.tenantIds[0],actorId:ctx.principalId,action,resourceId:id,outcome,at:new Date().toISOString()});return a.at(-1)}
function controlledException(fn){try{return{ok:true,value:fn()}}catch(e){return{ok:false,error:{type:e.name,message:e.message}}}}
function report(repo,ctx){auth(ctx,'report:read');return repo.list(ctx).map(s=>({id:s.id,name:s.name,status:s.status,version:s.version}))}
module.exports={ValidationError,AuthorizationError,SupplierRepository,auth,audit,controlledException,report,STATES,TRANSITIONS};