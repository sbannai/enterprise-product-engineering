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
