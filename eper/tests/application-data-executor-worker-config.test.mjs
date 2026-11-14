import test from "node:test";
import assert from "node:assert/strict";
import { readApplicationDataExecutorWorkerConfig } from "../dist/packages/workflows/application-data-executor-worker-config.js";

const env=()=>({
 EPER_APPLICATION_DATA_EXECUTOR_WORKER_ENABLED:"true",
 EPER_APPLICATION_DATA_EXECUTOR_DATABASE_URL:"postgresql://eper_data_executor:local-only@127.0.0.1:5432/eper",
 EPER_APPLICATION_DATA_EXECUTOR_EXPECTED_DATABASE_ROLE:"eper_data_executor",
 EPER_APPLICATION_DATA_EXECUTOR_WORKER_ID:"data-executor-local-01",
 EPER_APPLICATION_DATA_ACTIVITY_MODULE:"./dist/apps/worker/application-data-activities/default.js",
});
test("executor worker requires explicit enablement and a dedicated PostgreSQL role",()=>{
 const disabled=env();delete disabled.EPER_APPLICATION_DATA_EXECUTOR_WORKER_ENABLED;
 assert.throws(()=>readApplicationDataExecutorWorkerConfig(disabled),/APPLICATION_DATA_EXECUTOR_WORKER_DISABLED/);
 const mismatch=env();mismatch.EPER_APPLICATION_DATA_EXECUTOR_DATABASE_URL="postgresql://eper_api:local-only@127.0.0.1:5432/eper";
 assert.throws(()=>readApplicationDataExecutorWorkerConfig(mismatch),/APPLICATION_DATA_EXECUTOR_DATABASE_ROLE_MISMATCH/);
});
test("executor worker validates its trusted activity module path",()=>{
 const bad=env();bad.EPER_APPLICATION_DATA_ACTIVITY_MODULE="./dist/apps/api/main.js";
 assert.throws(()=>readApplicationDataExecutorWorkerConfig(bad),/APPLICATION_DATA_ACTIVITY_MODULE_PATH_INVALID/);
});
test("executor worker applies bounded defaults and overrides",()=>{
 const config=readApplicationDataExecutorWorkerConfig(env());
 assert.equal(config.workerId,"data-executor-local-01");
 assert.equal(config.expectedDatabaseRole,"eper_data_executor");
 assert.equal(config.idlePollMs,1000);
 assert.equal(config.maxContexts,1000);
 assert.equal(config.leaseMilliseconds,60000);
 assert.equal(config.maxAttempts,8);
 const custom=env();custom.EPER_APPLICATION_DATA_EXECUTOR_IDLE_POLL_MS="500";custom.EPER_APPLICATION_DATA_EXECUTOR_MAX_CONTEXTS="20";
 const changed=readApplicationDataExecutorWorkerConfig(custom);
 assert.equal(changed.idlePollMs,500);assert.equal(changed.maxContexts,20);
});
test("executor worker rejects invalid retry limits",()=>{
 const invalid=env();invalid.EPER_APPLICATION_DATA_EXECUTOR_MAX_ATTEMPTS="0";
 assert.throws(()=>readApplicationDataExecutorWorkerConfig(invalid),/EPER_APPLICATION_DATA_EXECUTOR_MAX_ATTEMPTS_OUT_OF_RANGE/);
});
