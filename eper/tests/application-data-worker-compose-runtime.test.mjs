import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const composeUrl = new URL("../docker-compose.local.yml", import.meta.url);
const dockerfileUrl = new URL("../Dockerfile", import.meta.url);

test("application-data worker services are opt-in and use the compiled worker entrypoints", async () => {
  const compose = await readFile(composeUrl, "utf8");
  for (const service of ["application-data-executor", "application-data-reconciliation"]) {
    const section = compose.split(new RegExp("^  " + service + ":\\s*$", "m"))[1]?.split(/^  [a-zA-Z0-9_-]+:\s*$/m)[0];
    assert.ok(section, service + " Compose service is missing");
    assert.match(section, /profiles:\s*\[["']application-data["']\]/);
    assert.match(section, /dockerfile:\s*Dockerfile/);
    assert.match(section, /condition:\s*service_healthy/);
  }
  assert.match(compose, /application-data-executor-main\.js/);
  assert.match(compose, /application-data-reconciliation-main\.js/);
});

test("optional worker profile does not make default Compose config require worker credentials", async () => {
  const compose = await readFile(composeUrl, "utf8");
  assert.match(compose, /EPER_APPLICATION_DATA_EXECUTOR_DATABASE_URL:\s*\$\{EPER_APPLICATION_DATA_EXECUTOR_DATABASE_URL:-\}/);
  assert.match(compose, /EPER_APPLICATION_DATA_EXECUTOR_EXPECTED_DATABASE_ROLE:\s*\$\{EPER_APPLICATION_DATA_EXECUTOR_EXPECTED_DATABASE_ROLE:-\}/);
  assert.match(compose, /EPER_APPLICATION_DATA_RECONCILIATION_DATABASE_URL:\s*\$\{EPER_APPLICATION_DATA_RECONCILIATION_DATABASE_URL:-\}/);
  assert.match(compose, /EPER_APPLICATION_DATA_RECONCILIATION_EXPECTED_DATABASE_ROLE:\s*\$\{EPER_APPLICATION_DATA_RECONCILIATION_EXPECTED_DATABASE_ROLE:-\}/);
});

test("worker runtime image packages all migrations needed by the workflow bootstrap", async () => {
  const dockerfile = await readFile(dockerfileUrl, "utf8");
  for (const migrationDirectory of [
    "packages/capabilities/migrations",
    "packages/application-data/migrations",
    "packages/workflows/migrations",
  ]) {
    assert.match(dockerfile, new RegExp("COPY --from=build /app/" + migrationDirectory.replaceAll("/", "\\/")));
  }
});
