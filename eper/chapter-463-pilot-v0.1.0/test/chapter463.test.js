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
