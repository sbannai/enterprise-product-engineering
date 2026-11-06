const test=require('node:test'); const assert=require('node:assert/strict');
const {RecordRepository,authorize,validateBusinessConditions,appendAudit,controlledException,report,AuthorizationError,ValidationError}=require('../src/domain');
const A={authenticated:true,principalId:'u1',tenantIds:['T1'],permissions:['record:create','record:read','report:read']};
const B={authenticated:true,principalId:'u2',tenantIds:['T2'],permissions:['record:read','report:read']};

test('REQ-46301: creates and reads tenant-scoped authoritative record',()=>{const r=new RecordRepository(); const x=r.create(A,{id:'R1',tenantId:'T1',name:'Alpha'}); assert.equal(x.version,1); assert.equal(r.get(A,'R1').name,'Alpha');});
test('REQ-46301: stale update is rejected',()=>{const r=new RecordRepository(); r.create(A,{id:'R1',tenantId:'T1',name:'Alpha'}); assert.throws(()=>r.update(A,'R1',{name:'Beta'},99),/concurrency conflict/);});
test('REQ-46302: missing permission is denied',()=>assert.throws(()=>authorize(B,'record:create'),AuthorizationError));
test('REQ-46302: cross-tenant resource access is denied',()=>{const r=new RecordRepository(); r.create(A,{id:'R1',tenantId:'T1',name:'Alpha'}); assert.throws(()=>r.get(B,'R1'),AuthorizationError);});
test('REQ-46303: mandatory business conditions are enforced',()=>assert.throws(()=>validateBusinessConditions({id:'R1',tenantId:'T1'}),ValidationError));
test('REQ-46304: privileged action produces audit evidence',()=>{const audit=[]; appendAudit(audit,A,'record:create','R1','SUCCESS'); assert.equal(audit.length,1); assert.equal(audit[0].resourceId,'R1');});
test('REQ-46305: controlled exception returns governed failure',()=>{const result=controlledException(()=>{throw new Error('business rejection')}); assert.equal(result.ok,false); assert.equal(result.error.message,'business rejection');});
test('REQ-46306: reporting is tenant-scoped and authorized',()=>{const r=new RecordRepository(); r.create(A,{id:'R1',tenantId:'T1',name:'Alpha'}); r.create({...A,tenantIds:['T2'],principalId:'u2'},{id:'R2',tenantId:'T2',name:'Beta'}); assert.deepEqual(report(r,A).map(x=>x.id),['R1']);});

test('REQ-46301: duplicate records are rejected and list remains tenant-scoped',()=>{const r=new RecordRepository(); r.create(A,{id:'R1',tenantId:'T1',name:'Alpha'}); assert.throws(()=>r.create(A,{id:'R1',tenantId:'T1',name:'Duplicate'}),/record already exists/); r.create({...A,tenantIds:['T2'],principalId:'u2'},{id:'R2',tenantId:'T2',name:'Beta'}); assert.deepEqual(r.list(A).map(x=>x.id),['R1']);});
test('REQ-46302: unauthenticated principals cannot perform authorized actions',()=>assert.throws(()=>authorize({...A,authenticated:false},'record:create'),AuthorizationError));
test('REQ-46303: short names fail business validation',()=>assert.throws(()=>validateBusinessConditions({id:'R1',tenantId:'T1',name:'AB'}),/at least 3 characters/));
test('REQ-46304: audit evidence captures tenant, actor, action and outcome',()=>{const audit=[]; const event=appendAudit(audit,A,'record:create','R1','SUCCESS'); assert.equal(event.tenantId,'T1'); assert.equal(event.actorId,'u1'); assert.equal(event.action,'record:create'); assert.equal(event.outcome,'SUCCESS'); assert.ok(Number.isFinite(Date.parse(event.occurredAt)));});
test('REQ-46305: controlled exception preserves error type and message',()=>{const result=controlledException(()=>{const e=new Error('governed rejection'); e.name='BusinessRuleError'; throw e;}); assert.equal(result.ok,false); assert.deepEqual(result.error,{type:'BusinessRuleError',message:'governed rejection'});});
test('REQ-46306: reporting rejects a principal without report permission',()=>assert.throws(()=>report(new RecordRepository(),{...A,permissions:['record:read']}),AuthorizationError));

test('REQ-46301: tenant membership is required before record creation',()=>{const r=new RecordRepository(); assert.throws(()=>r.create(A,{id:'R3',tenantId:'T2',name:'Cross-tenant'}),AuthorizationError); assert.equal(r.get(A,'R3'),null);});
test('REQ-46301: updates cannot change record tenant ownership',()=>{const r=new RecordRepository(); r.create(A,{id:'R4',tenantId:'T1',name:'Stable tenant'}); const updated=r.update(A,'R4',{name:'Still T1'},1); assert.equal(updated.tenantId,'T1'); assert.throws(()=>r.get(B,'R4'),AuthorizationError);});
test('REQ-46303: all mandatory fields are checked',()=>{for (const input of [{tenantId:'T1',name:'Alpha'},{id:'R5',name:'Alpha'},{id:'R5',tenantId:'T1'}]) assert.throws(()=>validateBusinessConditions(input),ValidationError);});
test('REQ-46304: denied cross-tenant creation leaves no record',()=>{const r=new RecordRepository(); assert.throws(()=>r.create(B,{id:'R6',tenantId:'T1',name:'Denied'}),AuthorizationError); assert.equal(r.get(A,'R6'),null);});
test('REQ-46306: report output contains only caller tenant records after mixed writes',()=>{const r=new RecordRepository(); r.create(A,{id:'R7',tenantId:'T1',name:'Alpha'}); r.create({...B,permissions:['record:create','report:read']},{id:'R8',tenantId:'T2',name:'Beta'}); assert.deepEqual(report(r,A).map(x=>x.tenantId),['T1']); assert.deepEqual(report(r,B).map(x=>x.tenantId),['T2']);});
