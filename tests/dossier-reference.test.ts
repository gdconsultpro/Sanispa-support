import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("references backfill by Paris creation date, use surnames, handle duplicates and stay immutable", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema private;
      create table public.customers(id uuid primary key, name text);
      create table public.client_profiles(user_id uuid primary key, last_name text);
      create table public.diagnostics(id uuid primary key default gen_random_uuid(), customer_id uuid, user_id uuid, created_at timestamptz default now(), status text);
      insert into public.customers values ('00000000-0000-4000-8000-000000000001', 'Jean Dupont');
      insert into public.client_profiles values ('00000000-0000-4000-8000-000000000002', 'Évrard');
      insert into public.diagnostics(customer_id,user_id,created_at) values
        ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','2026-11-18 23:30:00+00');`);
    await db.exec(await readFile("supabase/migrations/20261119105102_readable_dossier_references.sql", "utf8"));
    const first = (await db.query<any>("select id,public_reference from diagnostics")).rows[0];
    assert.equal(first.public_reference, "EVR-19112026");
    const add = "insert into diagnostics(customer_id,user_id,created_at) values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','2026-11-19 10:00:00+00') returning public_reference";
    const duplicates = await Promise.all([db.query<any>(add), db.query<any>(add)]);
    assert.deepEqual(duplicates.map(result => result.rows[0].public_reference).sort(), ["EVR-19112026-02", "EVR-19112026-03"]);
    await db.query("update client_profiles set last_name='Autre nom'");
    await db.query("update diagnostics set status='CLOSED' where id=$1", [first.id]);
    assert.equal((await db.query<any>("select public_reference from diagnostics where id=$1", [first.id])).rows[0].public_reference, "EVR-19112026");
    await assert.rejects(db.query("update diagnostics set public_reference='CHANGED' where id=$1", [first.id]), /DOSSIER_REFERENCE_IMMUTABLE/);
    await db.exec("grant usage on schema private to anon,authenticated;");
    for (const role of ["anon", "authenticated"]) {
      assert.equal((await db.query<any>("select has_table_privilege($1,'private.dossier_reference_counters','SELECT') allowed", [role])).rows[0].allowed, false);
      assert.equal((await db.query<any>("select has_function_privilege($1,'private.assign_dossier_reference()','EXECUTE') allowed", [role])).rows[0].allowed, false);
    }
  } finally { await db.close(); }
});
