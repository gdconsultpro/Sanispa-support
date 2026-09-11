import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const admin='00000000-0000-4000-8000-000000000001', user='00000000-0000-4000-8000-000000000002', a='00000000-0000-4000-8000-000000000010', b='00000000-0000-4000-8000-000000000011', dossier='00000000-0000-4000-8000-000000000020';
async function db(){
 const db=new PGlite();const schema=await readFile('supabase/schema.sql','utf8');
 const table=(name:string)=>schema.match(new RegExp(`create table if not exists ${name} \\([\\s\\S]*?\\n\\);`))![0];
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema private;
 create table auth.users(id uuid primary key,encrypted_password text,raw_app_meta_data jsonb,raw_user_meta_data jsonb);
 ${table('partners')}${table('partner_users')}${table('partner_departments')}
 create table admin_users(user_id uuid primary key,active boolean default true);
 create table diagnostics(id uuid primary key,status text default 'AVAILABLE',request_type text default 'TECHNICAL_REQUEST',choice text,department text,matched_partner_ids uuid[] default '{}',archived_at timestamptz,assigned_partner_id uuid,assigned_at timestamptz,lead_locked_until timestamptz);
 ${table('lead_purchases')}
 create table diagnostic_activity(id uuid default gen_random_uuid(),diagnostic_id uuid,actor text,status text,created_at timestamptz default now(),event_type text,old_status text,metadata jsonb);
 create table notification_jobs(id uuid default gen_random_uuid(),key text unique,kind text,payload jsonb);
 grant usage on schema public,auth,private to service_role;grant all on all tables in schema public to service_role;
 insert into auth.users(id,encrypted_password,raw_app_meta_data) values('${admin}','admin-fixture','{}'),('${user}','fixture-before','{"partner_password_change_required":true}');
 insert into admin_users values('${admin}',true);
 insert into partners(id,company_name,email) values('${a}','TEST A','a@example.invalid'),('${b}','TEST B','b@example.invalid');
 insert into partner_departments(partner_id,department) values('${a}','67'),('${b}','67');
 insert into diagnostics(id,choice,department,matched_partner_ids) values('${dossier}','intervention','67',array['${a}'::uuid]);`);
 await db.exec(await readFile('supabase/migrations/20260911111209_partner_billing_terms.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20260911114149_partner_access.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20260911114257_partner_manual_release.sql','utf8'));
 return db;
}
test('link is atomic, audited and cannot transfer a user silently',async()=>{const d=await db();try{
 await d.exec(`set role service_role;select link_partner_account('${a}','${user}','${admin}','TEST Contact');`);
 assert.equal((await d.query('select * from partner_access_history')).rows.length,1);
 await d.exec(`select link_partner_account('${a}','${user}','${admin}','TEST Contact');`);
 assert.equal((await d.query('select * from partner_access_history')).rows.length,1);
 await assert.rejects(d.exec(`select link_partner_account('${b}','${user}','${admin}','TEST Contact');`),/ACCOUNT_LINKED_ELSEWHERE/);
 await assert.rejects(d.exec(`select link_partner_account('${b}','${user}','${user}','TEST Contact');`),/ADMIN_REQUIRED/);
 await d.exec('reset role;set role authenticated;');await assert.rejects(d.exec(`select link_partner_account('${a}','${user}','${admin}','TEST');`),/permission denied/);
}finally{await d.close();}});
test('inactive access requires explicit reactivation',async()=>{const d=await db();try{
 await d.exec(`select link_partner_account('${a}','${user}','${admin}','TEST');update partner_users set active=false;`);
 await assert.rejects(d.exec(`select link_partner_account('${a}','${user}','${admin}','TEST');`),/ACCESS_INACTIVE/);
 await d.exec(`select link_partner_account('${a}','${user}','${admin}','TEST',true);`);
 assert.equal((await d.query<any>("select action from partner_access_history order by action")).rows[1].action,'reactivated');
}finally{await d.close();}});
test('only a successful Auth password change clears the mandatory flag',async()=>{const d=await db();try{
 await d.exec(`update auth.users set raw_user_meta_data='{"partner_password_change_required":false}' where id='${user}';`);
 assert.equal((await d.query<any>(`select raw_app_meta_data from auth.users where id='${user}'`)).rows[0].raw_app_meta_data.partner_password_change_required,true);
 await d.exec(`begin;update auth.users set encrypted_password='fixture-new' where id='${user}';rollback;`);
 assert.equal((await d.query<any>(`select raw_app_meta_data from auth.users where id='${user}'`)).rows[0].raw_app_meta_data.partner_password_change_required,true);
 await d.exec(`update auth.users set encrypted_password='fixture-new' where id='${user}';`);
 assert.equal((await d.query<any>(`select raw_app_meta_data from auth.users where id='${user}'`)).rows[0].raw_app_meta_data.partner_password_change_required,undefined);
}finally{await d.close();}});
test('manual approval restricts the recipient, is idempotent and never releases retrospectively',async()=>{const d=await db();try{
 assert.equal((await d.query('select * from notification_jobs')).rows.length,0);
 await d.exec(`select link_partner_account('${a}','${user}','${admin}','TEST');update partners set leads_paid=false where id='${a}';`);
 await assert.rejects(d.exec(`select prepare_partner_acquisition('${dossier}','${a}','${user}');`),/LEAD_UNAVAILABLE/);
 const job={diagnosticId:dossier,partners:[{id:a,email:'a@example.invalid'}]};
 await d.query('select release_partner_intervention($1,$2,$3,$4)',[dossier,a,admin,job]);
 await d.query('select release_partner_intervention($1,$2,$3,$4)',[dossier,a,admin,job]);
 assert.equal((await d.query('select * from notification_jobs')).rows.length,1);
 assert.equal((await d.query<any>('select matched_partner_ids from diagnostics')).rows[0].matched_partner_ids[0],a);
 await assert.rejects(d.query('select release_partner_intervention($1,$2,$3,$4)',[dossier,b,admin,{...job,partners:[{id:b,email:'b@example.invalid'}]}]),/ALREADY_RELEASED/);
}finally{await d.close();}});
