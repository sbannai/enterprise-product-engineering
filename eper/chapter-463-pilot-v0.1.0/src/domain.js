class ValidationError extends Error { constructor(message){ super(message); this.name='ValidationError'; } }
class AuthorizationError extends Error { constructor(message){ super(message); this.name='AuthorizationError'; } }

function requireTenant(ctx, tenantId){
  if (!ctx || !ctx.tenantIds?.includes(tenantId)) throw new AuthorizationError('Tenant access denied');
}

class RecordRepository {
  constructor(){ this.records = new Map(); this.audit = []; this.versions = new Map(); }
  create(ctx, record){
    requireTenant(ctx, record.tenantId);
    if (!record.id || !record.name) throw new ValidationError('id and name are required');
    if (this.records.has(record.id)) throw new ValidationError('record already exists');
    const value = {...record, version: 1, status: record.status ?? 'ACTIVE'};
    this.records.set(record.id, value); this.versions.set(record.id, 1);
    return structuredClone(value);
  }
  update(ctx, id, patch, expectedVersion){
    const current = this.records.get(id); if (!current) throw new Error('not found');
    requireTenant(ctx, current.tenantId);
    if (current.version !== expectedVersion) throw new Error('concurrency conflict');
    const next = {...current, ...patch, version: current.version + 1};
    this.records.set(id, next); this.versions.set(id, next.version);
    return structuredClone(next);
  }
  get(ctx, id){ const r=this.records.get(id); if(!r) return null; requireTenant(ctx,r.tenantId); return structuredClone(r); }
  list(ctx){ return [...this.records.values()].filter(r=>ctx.tenantIds.includes(r.tenantId)).sort((a,b)=>a.id.localeCompare(b.id)).map(r=>structuredClone(r)); }
}

function authorize(ctx, action){
  if (!ctx?.authenticated) throw new AuthorizationError('Authentication required');
  if (!ctx.permissions?.includes(action)) throw new AuthorizationError('Permission denied');
  return true;
}

function validateBusinessConditions(input){
  if (!input?.id || !input?.tenantId || !input?.name) throw new ValidationError('id, tenantId and name are mandatory');
  if (input.name.trim().length < 3) throw new ValidationError('name must contain at least 3 characters');
  return true;
}

function appendAudit(audit, ctx, action, resourceId, outcome){
  audit.push({id:`AUD-${audit.length+1}`, actorId:ctx.principalId, tenantId:ctx.tenantIds[0], action, resourceId, outcome, occurredAt:new Date().toISOString()});
  return audit[audit.length-1];
}

function controlledException(operation){
  try { return {ok:true,value:operation()}; }
  catch(error){ return {ok:false,error:{type:error.name,message:error.message}}; }
}

function report(repo, ctx){
  authorize(ctx,'report:read');
  return repo.list(ctx).map(r=>({id:r.id, tenantId:r.tenantId, name:r.name, status:r.status, version:r.version}));
}

module.exports={ValidationError,AuthorizationError,RecordRepository,authorize,validateBusinessConditions,appendAudit,controlledException,report};
