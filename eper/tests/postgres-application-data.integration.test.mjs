import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PostgresApplicationDataAdapter } from "../dist/packages/application-data/postgres-adapter.js";
import { ApplicationDataService } from "../dist/packages/application-data/service.js";

const enabled=process.env.EPER_APPLICATION_DATA_LIVE_TESTS==="1" && !!process.env.DATABASE_URL;
test("PostgreSQL application data is application-scoped and commits audit/outbox with record mutations", {skip:!enabled}, async () => {
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:3});
  const suffix=randomUUID().replace(/-/g,"");
  const context={tenantId:"data-ci-"+suffix,applicationId:"app-ci-"+suffix,actorId:"actor-ci",correlationId:"corr-"+suffix,requirementId:"APP_DATA_CI"};
  try {
    const service=new ApplicationDataService(new PostgresApplicationDataAdapter(pool));
    await service.registerModel({tenantId:context.tenantId,applicationId:context.applicationId,entityType:"Order",version:1,status:"ACTIVE",
      fields:[{id:"customerId",type:"string",required:true},{id:"total",type:"number",required:true}]});
    const created=await service.create(context,"Order","order-"+suffix,{customerId:"customer-1",total:25});
    assert.equal(created.version,1);
    const updated=await service.update(context,"Order",created.id,1,{data:{customerId:"customer-1",total:30}});
    assert.equal(updated.version,2);
    await assert.rejects(()=>service.update(context,"Order",created.id,1,{state:"ARCHIVED"}),/VERSION_CONFLICT/);
    assert.equal((await service.query(context,"Order",{limit:10})).length,1);
    const otherApp=await service.query({...context,applicationId:context.applicationId+"-other"},"Order",{limit:10}).catch(()=>[]);
    assert.equal(otherApp.length,0);
    await service.delete(context,"Order",created.id,2);
    const audit=await pool.query("SELECT count(*)::int AS count FROM audit_evidence WHERE tenant_id=$1 AND correlation_id=$2",[context.tenantId,context.correlationId]);
    const outbox=await pool.query("SELECT count(*)::int AS count FROM transactional_outbox WHERE tenant_id=$1 AND correlation_id=$2",[context.tenantId,context.correlationId]);
    assert.equal(audit.rows[0].count,3);
    assert.equal(outbox.rows[0].count,3);
  } finally { await pool.end(); }
});

test("PostgreSQL relationship references serialize with target deletion", {skip:!enabled}, async () => {
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:3});
  const suffix=randomUUID().replace(/-/g,"");
  const context={tenantId:"data-rel-"+suffix,applicationId:"app-rel-"+suffix,actorId:"actor-rel",correlationId:"corr-rel-"+suffix,requirementId:"APP_DATA_REL_CI"};
  try {
    const service=new ApplicationDataService(new PostgresApplicationDataAdapter(pool));
    await service.registerModel({tenantId:context.tenantId,applicationId:context.applicationId,entityType:"Customer",version:1,status:"ACTIVE",
      fields:[{id:"name",type:"string",required:true}]});
    await service.registerModel({tenantId:context.tenantId,applicationId:context.applicationId,entityType:"Order",version:1,status:"ACTIVE",
      fields:[{id:"customerId",type:"string",required:true},{id:"total",type:"number",required:true}],
      relationships:[{field:"customerId",targetEntity:"Customer",cardinality:"one"}]});
    await service.create(context,"Customer","customer-"+suffix,{name:"A"});
    await service.create(context,"Order","order-"+suffix,{customerId:"customer-"+suffix,total:10});
    await assert.rejects(()=>service.delete(context,"Customer","customer-"+suffix,1),/APPLICATION_DATA_RECORD_REFERENCED/);
    await service.delete(context,"Order","order-"+suffix,1);
    await service.delete(context,"Customer","customer-"+suffix,1);
  } finally { await pool.end(); }
});

test("PostgreSQL create idempotency replays the original response without duplicate audit/outbox writes", {skip:!enabled}, async () => {
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:3});
  const suffix=randomUUID().replace(/-/g,"");
  const context={tenantId:"data-idem-"+suffix,applicationId:"app-idem-"+suffix,actorId:"actor-idem",correlationId:"corr-idem-"+suffix,requirementId:"APP_DATA_IDEM_CI",idempotencyKey:"checkout-"+suffix};
  try {
    const service=new ApplicationDataService(new PostgresApplicationDataAdapter(pool));
    await service.registerModel({tenantId:context.tenantId,applicationId:context.applicationId,entityType:"Order",version:1,status:"ACTIVE",
      fields:[{id:"customerId",type:"string",required:true},{id:"total",type:"number",required:true}]});
    const first=await service.create(context,"Order","order-"+suffix,{customerId:"customer-1",total:25});
    const replay=await service.create(context,"Order","order-"+suffix,{customerId:"customer-1",total:25});
    assert.deepEqual(replay,first);
    await assert.rejects(()=>service.create(context,"Order","order-other-"+suffix,{customerId:"customer-1",total:99}),/IDEMPOTENCY_KEY_REUSED/);
    const records=await service.query(context,"Order",{limit:10});
    assert.equal(records.length,1);
    const audit=await pool.query("SELECT count(*)::int AS count FROM audit_evidence WHERE tenant_id=$1 AND correlation_id=$2",[context.tenantId,context.correlationId]);
    const outbox=await pool.query("SELECT count(*)::int AS count FROM transactional_outbox WHERE tenant_id=$1 AND correlation_id=$2",[context.tenantId,context.correlationId]);
    assert.equal(audit.rows[0].count,1);
    assert.equal(outbox.rows[0].count,1);
  } finally { await pool.end(); }
});
