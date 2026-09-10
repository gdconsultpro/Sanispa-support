import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { validateSubmission } from "../lib/draft-schema";
import { PDFDocument } from "pdf-lib";
import { buildSummaryPdf } from "../lib/pdf";
import { decodePhoto } from "../lib/photos";
import { adminDenied } from "../lib/admin-auth";
const user = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const id = "00000000-0000-4000-8000-000000000010";
const payload = { name: "Client Test", phone: "0600000000", email: "test@example.invalid", address: "", postalCode: "75001", city: "Paris", spaBrand: "Test", spaModel: "", spaYear: "", installationType: "exterieur", powerSupply: "", problemType: "autre", answers: { description: "La commande ne répond pas", started_when: "Hier", still_usable: "Non" }, photos: {}, choice: "devis", paymentPlan: "" };
async function database() {
    const db = new PGlite();
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
 create table auth.sessions(id uuid primary key,user_id uuid,factor_id uuid,aal text,not_after timestamptz);
 create table auth.mfa_factors(id uuid primary key,user_id uuid,status text,factor_type text);
 create function auth.role() returns text language sql as $$select current_user::text$$;
 create function auth.uid() returns uuid language sql as $$select null::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
 create table storage.objects(id uuid,bucket_id text);
 `);
    const schema = (await readFile('supabase/schema.sql', 'utf8')).replace('create extension if not exists "pgcrypto";', '');
    await db.exec(schema);
    for (const file of (await readdir('supabase/migrations')).sort())
        await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()),($3,$4,now())', [user, payload.email, other, 'other@example.invalid']);
    return db;
}
test('required answers and unavailable paid plans are rejected', () => {
    assert.throws(() => validateSubmission({ ...payload, problemType: 'electrique', answers: {}, photos: {} }), /Réponse requise/);
    assert.throws(() => validateSubmission({ ...payload, choice: 'remote', paymentPlan: 'premium' }), /prestation/);
    assert.equal(validateSubmission(payload).name, payload.name);
});
test('photo decoding refuses SVG and forged image bytes', () => {
    assert.throws(() => decodePhoto('data:image/svg+xml;base64,PHN2Zz4='));
    assert.throws(() => decodePhoto('data:image/jpeg;base64,' + Buffer.from('not an image at all').toString('base64')));
});
test('PDFs paginate long dossiers and accept French accents', async () => {
    const buffer = await buildSummaryPdf(Array.from({ length: 160 }, (_, i) => `Été, réparation, température — dossier ${i}`));
    const pdf = await PDFDocument.load(buffer);
    assert.ok(pdf.getPageCount() >= 3);
});
test('legacy shared administrator password is never accepted', async () => {
    process.env.ADMIN_USERNAME = 'admin-test';
    process.env.ADMIN_PASSWORD = 'temporary-test-password';
    const response = await adminDenied(new Request('https://app.example.invalid/api/admin', {headers: {Authorization: 'Basic ' + Buffer.from('admin-test:temporary-test-password').toString('base64')}}));
    assert.equal(response?.status, 401);
});
test('draft ownership, cross-device conflict, submission transaction and duplicate retry', async () => {
    const db = await database();
    try {
        await db.query('select save_diagnostic_draft($1,$2,0,$3,$4)', [id, user, '/questionnaire', JSON.stringify(payload)]);
        const stored = await db.query<{
            payload: typeof payload;
            version: number;
        }>('select payload,version from diagnostic_drafts where id=$1', [id]);
        assert.equal(stored.rows[0].payload.phone, payload.phone);
        assert.equal(stored.rows[0].version, 1);
        assert.equal((await db.query<{phone:string}>("select phone from client_profiles where user_id=$1",[user])).rows[0].phone,payload.phone);
        await assert.rejects(db.query('select save_diagnostic_draft($1,$2,1,$3,$4)', [id, other, '/upload', JSON.stringify(payload)]), /DRAFT_CONFLICT/);
        await db.query('select save_diagnostic_draft($1,$2,1,$3,$4)', [id, user, '/upload', JSON.stringify(payload)]);
        await assert.rejects(db.query('select save_diagnostic_draft($1,$2,1,$3,$4)', [id, user, '/resume', JSON.stringify(payload)]), /DRAFT_CONFLICT/);
        const submit = (photos = '[]') => db.query('select submit_diagnostic($1,$2,2,$3,$4,$5,$6,$7)', [id, user, '75', [], JSON.stringify([{ question_key: 'description', question_label: 'Description', answer: 'Essai' }]), photos, JSON.stringify([{ key: `${id}:customer`, kind: 'customer', payload: { diagnosticId: id } }])]);
        await assert.rejects(submit('[{"photo_type":"test"}]'));
        assert.equal((await db.query<{
            n: number;
        }>('select count(*)::int n from customers')).rows[0].n, 0, 'failed submission rolls back customer creation');
        await submit();
        await submit();
        assert.equal((await db.query<{
            n: number;
        }>('select count(*)::int n from diagnostics')).rows[0].n, 1);
        assert.equal((await db.query<{
            n: number;
        }>('select count(*)::int n from notification_jobs')).rows[0].n, 1);
        await assert.rejects(db.query('select save_diagnostic_draft($1,$2,2,$3,$4)', [id, user, '/resume', JSON.stringify(payload)]), /DRAFT_CONFLICT/);
        const check = await db.query<{
            allowed: boolean;
        }>("select has_function_privilege('authenticated','public.save_diagnostic_draft(uuid,uuid,integer,text,jsonb)','EXECUTE') allowed");
        assert.equal(check.rows[0].allowed, false);
    }
    finally {
        await db.close();
    }
});
test('payment retries keep original expiry and never reactivate refunded access', async () => {
    const db = await database();
    try {
        const waterPayload = { ...payload, choice: 'remote', problemType: 'traitement-eau', paymentPlan: 'water' };
        await db.query('select save_diagnostic_draft($1,$2,0,$3,$4)', [id, user, '/resume', JSON.stringify(waterPayload)]);
        await db.query('select submit_diagnostic($1,$2,1,$3,$4,$5,$6,$7)', [id, user, '75', [], '[]', '[]', '[]']);
        const a = await db.query<{
            w: {
                id: string;
            };
        }>('select prepare_water_checkout($1,$2) w', [id, user]);
        const water = a.rows[0].w.id;
        const b = await db.query<{
            w: {
                id: string;
            };
        }>('select prepare_water_checkout($1,$2) w', [id, user]);
        assert.equal(b.rows[0].w.id, water);
        await assert.rejects(db.query('select prepare_water_checkout($1,$2)', [id, other]), /NOT_FOUND/);
        const pay = (event: string, date: string) => db.query('select apply_water_payment($1,$2,$3,$4,$5,4900,$6,$7,7,$8)', [event, 'cs_test', water, id, 'pi_test', 'eur', date, '{}']);
        await pay('evt_1', '2026-09-08T12:00:00Z');
        await pay('evt_1', '2026-09-09T12:00:00Z');
        await pay('evt_2', '2026-09-10T12:00:00Z');
        const w = await db.query<{
            expires_at: string;
        }>("select expires_at::text from water_assistance_sessions where id=$1", [water]);
        assert.match(w.rows[0].expires_at, /2026-09-15/);
        assert.equal((await db.query<{
            n: number;
        }>('select count(*)::int n from payments')).rows[0].n, 1);
        await db.query("update water_assistance_sessions set status='refunded' where id=$1", [water]);
        await pay('evt_3', '2026-09-12T12:00:00Z');
        assert.equal((await db.query<{
            status: string;
        }>('select status from water_assistance_sessions where id=$1', [water])).rows[0].status, 'refunded');
    }
    finally {
        await db.close();
    }
});
test('notification claims prevent two workers from sending the same job', async () => {
    const db = await database();
    try {
        await db.query("insert into notification_jobs(key,kind,payload) values('job-test','customer','{}')");
        assert.equal((await db.query("select * from claim_notifications(null)")).rows.length, 1);
        assert.equal((await db.query("select * from claim_notifications(null)")).rows.length, 0);
        await db.exec("update notification_jobs set locked_until=now()-interval '1 minute'");
        assert.equal((await db.query("select * from claim_notifications(null)")).rows.length, 1);
    }
    finally {
        await db.close();
    }
});
test('shared rate limit closes after the configured number of calls', async () => {
    const db = await database();
    try {
        const call = async () => (await db.query<{
            allowed: boolean;
        }>("select consume_request_limit('test',2,60) allowed")).rows[0].allowed;
        assert.equal(await call(), true);
        assert.equal(await call(), true);
        assert.equal(await call(), false);
        await db.exec("update request_limits set resets_at=now()-interval '1 second'");
        assert.equal(await call(), true);
    }
    finally {
        await db.close();
    }
});

test('administrator membership, MFA and revoked sessions are enforced in the database', async () => {
    const db = await database();
    const session = '00000000-0000-4000-8000-000000000050';
    const factor = '00000000-0000-4000-8000-000000000060';
    try {
        const state = async () => (await db.query<{ state: {active:boolean;is_admin:boolean;mfa_verified:boolean} }>('select private_session_status($1,$2) state', [user, session])).rows[0].state;
        await db.query('insert into auth.sessions(id,user_id,aal) values($1,$2,$3)', [session, user, 'aal1']);
        assert.deepEqual(await state(), {active:true,is_admin:false,mfa_verified:false});
        await db.query('insert into admin_users(user_id) values($1)', [user]);
        assert.deepEqual(await state(), {active:true,is_admin:true,mfa_verified:false});
        await db.query("insert into auth.mfa_factors(id,user_id,status,factor_type) values($1,$2,'verified','totp')", [factor, user]);
        await db.query("update auth.sessions set factor_id=$1,aal='aal2' where id=$2", [factor, session]);
        assert.deepEqual(await state(), {active:true,is_admin:true,mfa_verified:true});
        await db.query('update admin_users set active=false where user_id=$1', [user]);
        assert.equal((await state()).is_admin, false);
        await db.query('delete from auth.sessions where id=$1', [session]);
        assert.equal((await state()).active, false);
        assert.equal((await state()).mfa_verified, false);
        await db.exec('set role authenticated');
        await assert.rejects(db.query('select private_session_status($1,$2)', [user, session]), /permission denied/);
        await assert.rejects(db.query('insert into admin_users(user_id) values($1)', [other]), /permission denied/);
        await assert.rejects(db.query('select * from client_profiles'), /permission denied/);
    } finally { await db.close(); }
});
