import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(resolve(root, "scripts/dev-verify.mjs"), "utf8");
const migrationBlock = source.match(/const migrations = \[([\s\S]*?)\];/);

test("dev:verify applies and repeats all seven PostgreSQL migration groups", () => {
  assert.ok(migrationBlock, "dev:verify must declare one shared migration list");
  const configured = [...migrationBlock[1].matchAll(/"(migrate:[a-z-]+)"/g)].map((match) => match[1]);
  assert.deepEqual(configured, [
    "migrate:payments",
    "migrate:audit",
    "migrate:workflows",
    "migrate:campaign-scheduler",
    "migrate:capabilities",
    "migrate:ticketing",
    "migrate:identity",
  ]);
  assert.match(source, /for \(const migration of migrations\) \{\s*run\(`PostgreSQL migration:/);
  assert.match(source, /for \(const migration of migrations\) \{\s*run\(`Repeatability check:/);
});
