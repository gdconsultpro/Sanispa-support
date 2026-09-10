import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { nextActionMutationSchema, type NextActionSnapshot } from "../lib/admin-follow-up";

const id = "00000000-0000-4000-8000-000000000010";
const actor = "00000000-0000-4000-8000-000000000001";
const dueAt = "2026-09-12T08:30:00Z";
const migration = "supabase/migrations/20260910231923_admin_follow_up.sql";

async function database() {
  // Minimal affected baseline, with the actual existing and new migrations.
  // All data is fictional, in-memory; no Supabase or Stripe transport exists here.
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.diagnostics (id uuid primary key, status text not null);
    alter table public.diagnostics enable row level security;
    create table public.diagnostic_drafts(id uuid);
    create table public.request_limits(id uuid);
    create table public.notification_jobs(id uuid);
    create table public.stripe_events(id uuid);
  `);
  await db.exec(await readFile("supabase/migrations/20260908_04_sav.sql", "utf8"));
  await db.query("insert into diagnostics(id,status,internal_notes,next_action_at) values($1,'AVAILABLE','Note historique',$2)", [id, "2026-09-08T10:00:00Z"]);
  await db.query("insert into diagnostic_activity(diagnostic_id,actor,status,created_at) values($1,$2,'AVAILABLE','2026-09-08T09:00:00Z')", [id, actor]);
  await db.exec(await readFile(migration, "utf8"));
  return db;
}
async function action(db: PGlite, operation: string, version: number, text: string | null = null, date: string | null = null) {
  return (await db.query<{ action: NextActionSnapshot }>(
    "select update_admin_next_action($1,$2,$3,$4,$5,$6) action", [id, operation, text, date, version, actor]
  )).rows[0].action;
}

test("next action validation requires bounded text, an ISO deadline and a nonnegative version", () => {
  assert.deepEqual(nextActionMutationSchema.parse({ operation: "save", text: "  Appeler le client  ", dueAt, expectedVersion: 0 }),
    { operation: "save", text: "Appeler le client", dueAt, expectedVersion: 0 });
  assert(nextActionMutationSchema.safeParse({ operation: "save", text: "Relire", dueAt: "2026-09-12T10:30:00+02:00", expectedVersion: 3 }).success);
  for (const invalid of [
    { operation: "save", text: " ", dueAt, expectedVersion: 0 },
    { operation: "save", text: "x".repeat(1001), dueAt, expectedVersion: 0 },
    { operation: "save", text: "Rappeler", dueAt: "2026-09-12T08:30", expectedVersion: 0 },
    { operation: "save", text: "Rappeler", expectedVersion: 0 },
    { operation: "save", text: "Rappeler", dueAt, expectedVersion: -1 },
    { operation: "save", text: "Rappeler", dueAt, expectedVersion: 0.5 },
    { operation: "save", text: "Rappeler", dueAt, expectedVersion: 0, actor: "forged" },
    { operation: "complete", text: "Different", expectedVersion: 1 },
    { operation: "cancel" }, { operation: "remove", expectedVersion: 0 },
  ]) assert.equal(nextActionMutationSchema.safeParse(invalid).success, false);
  assert(nextActionMutationSchema.safeParse({ operation: "complete", expectedVersion: 1 }).success);
  assert(nextActionMutationSchema.safeParse({ operation: "cancel", expectedVersion: 1 }).success);
});

test("migration preserves historic notes, deadline and activity without inventing events", async () => {
  const db = await database();
  try {
    const row = (await db.query<{ internal_notes: string; next_action_at: Date; next_action_text: null; next_action_state: null; next_action_version: number }>("select * from diagnostics")).rows[0];
    assert.equal(row.internal_notes, "Note historique");
    assert.equal(new Date(row.next_action_at).toISOString(), "2026-09-08T10:00:00.000Z");
    assert.equal(row.next_action_text, null); assert.equal(row.next_action_state, null); assert.equal(row.next_action_version, 0);
    const history = (await db.query("select actor,status,event_type,old_status,metadata from diagnostic_activity")).rows;
    assert.deepEqual(history, [{ actor, status: "AVAILABLE", event_type: null, old_status: null, metadata: null }]);
  } finally { await db.close(); }
});

test("action lifecycle is versioned and records before/after snapshots with the supplied server actor", async () => {
  const db = await database();
  try {
    await db.exec("set role service_role");
    const created = await action(db, "save", 0, "  Appeler le client  ", dueAt);
    assert.equal(created.text, "Appeler le client"); assert.equal(created.state, "pending"); assert.equal(created.version, 1);
    assert.equal(new Date(created.dueAt!).toISOString(), "2026-09-12T08:30:00.000Z");
    const changed = await action(db, "save", 1, "Demander une photo", "2026-09-13T10:00:00Z");
    assert.equal(changed.version, 2); assert.equal(changed.state, "pending");
    const completed = await action(db, "complete", 2);
    assert.equal(completed.state, "done"); assert.equal(completed.text, changed.text); assert.equal(completed.version, 3);
    const next = await action(db, "save", 3, "Relire le dossier", dueAt);
    assert.equal(next.version, 4); assert.equal(next.state, "pending");
    const cancelled = await action(db, "cancel", 4);
    assert.equal(cancelled.state, "cancelled"); assert.equal(cancelled.version, 5);
    assert.equal((await action(db, "save", 5, "Reprendre le contact", dueAt)).version, 6);
    const events = (await db.query<{ actor: string; event_type: string; metadata: { before: { text: string | null; state: string | null }; after: { text: string; state: string } } }>("select actor,event_type,metadata from diagnostic_activity where event_type is not null order by created_at,id")).rows;
    assert.equal(events.length, 6); assert(events.every(event => event.actor === actor));
    assert.equal(events.filter(event => event.event_type === "action_created").length, 3);
    assert(events.some(event => event.event_type === "action_updated" && event.metadata.before.text === "Appeler le client" && event.metadata.after.text === "Demander une photo"));
    assert(events.some(event => event.event_type === "action_completed" && event.metadata.before.state === "pending" && event.metadata.after.state === "done"));
    assert(events.some(event => event.event_type === "action_cancelled" && event.metadata.after.state === "cancelled"));
  } finally { await db.close(); }
});

test("stale requests, missing dossiers, invalid transitions and direct invalid SQL cannot overwrite an action", async () => {
  const db = await database();
  try {
    await assert.rejects(action(db, "complete", 0), /NEXT_ACTION_STATE/);
    await assert.rejects(action(db, "save", 0, " ", dueAt), /NEXT_ACTION_INVALID/);
    await assert.rejects(action(db, "save", 0, "x".repeat(1001), dueAt), /NEXT_ACTION_INVALID/);
    await assert.rejects(action(db, "save", 0, "Rappel", "infinity"), /NEXT_ACTION_INVALID/);
    await assert.rejects(action(db, "save", 0, "Rappel", null), /NEXT_ACTION_INVALID/);
    await assert.rejects(db.query("select update_admin_next_action('00000000-0000-4000-8000-000000000099','save','Rappel',$1,0,$2)", [dueAt, actor]), /NOT_FOUND/);
    await action(db, "save", 0, "Original", dueAt);
    const requests = await Promise.allSettled([
      action(db, "save", 1, "Premier onglet", dueAt),
      action(db, "save", 1, "Second onglet", dueAt),
    ]);
    assert.equal(requests.filter(result => result.status === "fulfilled").length, 1);
    const rejected = requests.find(result => result.status === "rejected") as PromiseRejectedResult;
    assert.match(String(rejected.reason), /NEXT_ACTION_CONFLICT/);
    await assert.rejects(action(db, "cancel", 1), /NEXT_ACTION_CONFLICT/);
    await action(db, "complete", 2);
    await assert.rejects(action(db, "cancel", 3), /NEXT_ACTION_STATE/);
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from diagnostic_activity where event_type is not null")).rows[0].n, 3);
  } finally { await db.close(); }
});

test("status and note updates preserve the independent action and do not copy notes into activity", async () => {
  const db = await database();
  try {
    const original = await action(db, "save", 0, "Rappel prévu", dueAt);
    const save = (status: string, notes: string, next: string | null = null) => db.query("select update_sav($1,$2,$3,$4,$5)", [id, status, notes, next, actor]);
    await save("en analyse", "Note confidentielle fictive");
    await save("en analyse", "Nouvelle note sensible fictive", "2030-01-01T00:00:00Z");
    await save("en analyse", "Nouvelle note sensible fictive");
    const row = (await db.query<{ next_action_at: Date; next_action_text: string; next_action_state: string; next_action_version: number }>("select * from diagnostics")).rows[0];
    assert.equal(new Date(row.next_action_at).toISOString(), new Date(original.dueAt!).toISOString());
    assert.equal(row.next_action_text, original.text); assert.equal(row.next_action_state, original.state); assert.equal(row.next_action_version, original.version);
    const history = (await db.query<{ event_type: string; old_status: string | null; status: string; actor: string; metadata: unknown }>("select event_type,old_status,status,actor,metadata from diagnostic_activity where event_type in ('status_changed','notes_updated')")).rows;
    assert.equal(history.filter(event => event.event_type === "status_changed").length, 1);
    assert.equal(history.find(event => event.event_type === "status_changed")?.old_status, "AVAILABLE");
    assert.equal(history.filter(event => event.event_type === "notes_updated").length, 2);
    assert(history.every(event => event.actor === actor && event.status === "en analyse" && event.metadata === null));
    assert(!JSON.stringify(history).includes("confidentielle")); assert(!JSON.stringify(history).includes("sensible"));
  } finally { await db.close(); }
});

test("failed history insertion rolls back the action mutation", async () => {
  const db = await database();
  try {
    await db.exec(`create function fail_audit() returns trigger language plpgsql as $$ begin raise exception 'AUDIT_FAILURE'; end; $$;
      create trigger fail_audit before insert on diagnostic_activity for each row execute function fail_audit();`);
    await assert.rejects(action(db, "save", 0, "Non enregistrée", dueAt), /AUDIT_FAILURE/);
    assert.deepEqual((await db.query("select next_action_text,next_action_state,next_action_version from diagnostics")).rows[0], { next_action_text: null, next_action_state: null, next_action_version: 0 });
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from diagnostic_activity")).rows[0].n, 1);
  } finally { await db.close(); }
});

test("follow-up RPCs are invoker functions reserved to service_role and history remains private", async () => {
  const db = await database();
  try {
    const functions = (await db.query<{ proname: string; prosecdef: boolean }>("select proname,prosecdef from pg_proc where proname in ('update_sav','update_admin_next_action')")).rows;
    assert.equal(functions.length, 2); assert(functions.every(fn => !fn.prosecdef));
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(action(db, "save", 0, "Interdit", dueAt), /permission denied/);
      await assert.rejects(db.query("select update_sav($1,'terminé','',null,$2)", [id, actor]), /permission denied/);
      await assert.rejects(db.query("select * from diagnostic_activity"), /permission denied/);
      await db.exec("reset role");
    }
    assert.equal((await db.query<{ allowed: boolean }>("select exists(select 1 from pg_proc p, lateral aclexplode(p.proacl) a where p.proname='update_admin_next_action' and a.grantee=0 and a.privilege_type='EXECUTE') allowed")).rows[0].allowed, false);
    await db.exec("set role service_role");
    assert.equal((await action(db, "save", 0, "Autorisé", dueAt)).version, 1);
    await db.query("select update_sav($1,'en analyse','',null,$2)", [id, actor]);
    assert.equal((await db.query<{ n: number }>("select count(*)::int n from diagnostic_activity")).rows[0].n, 4);
  } finally { await db.close(); }
});
