import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { runMigrations } from "../scripts/migrate-payments.mjs";

const connectionString = process.env.EPER_AUDIT_DATABASE_URL
  ?? process.env.EPER_PAYMENT_DATABASE_URL
  ?? process.env.DATABASE_URL
  ?? "";

test("PostgreSQL migration runner supports incremental upgrade, idempotent rerun and checksum drift rejection",
  { skip: !connectionString },
  async () => {
    const suffix = randomUUID().replace(/-/g, "");
    const table = "eper_migration_fixture_" + suffix;
    const ledger = "eper_migration_fixture_ledger_" + suffix;
    const directory = await mkdtemp(join(tmpdir(), "eper-migration-fixture-"));
    const first = join(directory, "001_fixture_base.sql");
    const second = join(directory, "002_fixture_upgrade.sql");
    const client = new Client({ connectionString, connectionTimeoutMillis: 5_000 });
    let clientConnected = false;

    try {
      await mkdir(directory, { recursive: true });
      await writeFile(first, `CREATE TABLE public.${table} (id integer PRIMARY KEY);`);
      await runMigrations(connectionString, {
        directory, ledgerTable: ledger, lockName: "eper:migration-fixture:" + suffix,
        applicationName: "eper-migration-fixture-test",
      });

      await writeFile(second, `INSERT INTO public.${table} (id) VALUES (1);`);
      await runMigrations(connectionString, {
        directory, ledgerTable: ledger, lockName: "eper:migration-fixture:" + suffix,
        applicationName: "eper-migration-fixture-test",
      });
      await runMigrations(connectionString, {
        directory, ledgerTable: ledger, lockName: "eper:migration-fixture:" + suffix,
        applicationName: "eper-migration-fixture-test",
      });

      await client.connect();
      clientConnected = true;
      const rows = await client.query(`SELECT id FROM public.${table} ORDER BY id`);
      const ledgerRows = await client.query(
        `SELECT migration_name FROM public.${ledger} ORDER BY migration_name`,
      );
      assert.deepEqual(rows.rows.map(row => row.id), [1], "upgrade and rerun must not duplicate effects");
      assert.deepEqual(ledgerRows.rows.map(row => row.migration_name), [
        "001_fixture_base.sql", "002_fixture_upgrade.sql",
      ]);

      await writeFile(first, `CREATE TABLE public.${table} (id integer PRIMARY KEY, changed boolean);`);
      await assert.rejects(
        () => runMigrations(connectionString, {
          directory, ledgerTable: ledger, lockName: "eper:migration-fixture:" + suffix,
          applicationName: "eper-migration-fixture-test",
        }),
        new RegExp("EPER_PAYMENT_MIGRATION_CHECKSUM_MISMATCH:001_fixture_base\\.sql"),
      );
    } finally {
      if (!clientConnected) {
        try { await client.connect(); clientConnected = true; } catch { /* database setup failure */ }
      }
      if (clientConnected) {
        try { await client.query(`DROP TABLE IF EXISTS public.${table}`); } catch { /* cleanup best effort */ }
        try { await client.query(`DROP TABLE IF EXISTS public.${ledger}`); } catch { /* cleanup best effort */ }
        await client.end();
      }
      await rm(directory, { recursive: true, force: true });
    }
  });
