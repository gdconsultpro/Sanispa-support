import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
export const ids={admin:'00000000-0000-4000-8000-000000000001',user:'00000000-0000-4000-8000-000000000002',otherUser:'00000000-0000-4000-8000-000000000003',a:'00000000-0000-4000-8000-000000000010',b:'00000000-0000-4000-8000-000000000011',d:'00000000-0000-4000-8000-000000000020',customer:'00000000-0000-4000-8000-000000000030'};
export const migration='supabase/migrations/20260911121701_partner_dispatch_decision.sql';
export async function dispatchDatabase(){
 const db=new PGlite();const schema=await readFile('supabase/schema.sql','utf8');
 const table=(name:string)=>schema.match(new RegExp(`create table if not exists ${name} \\([\\s\\S]*?\\n\\);`))![0];
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);
 ${['customers','diagnostics','diagnostic_answers','diagnostic_photos','partners','partner_users','partner_departments','lead_purchases'].map(table).join('\n')}
 alter table diagnostics add column assigned_partner_id uuid,add column assigned_at timestamptz,add column lead_locked_until timestamptz,add column user_id uuid,add column spa_id uuid;
 create table admin_users(user_id uuid primary key,active boolean default true);
 create table diagnostic_drafts(id uuid primary key,user_id uuid,payload jsonb,version int default 1,submitted_at timestamptz,updated_at timestamptz default now());
 create table diagnostic_activity(id uuid default gen_random_uuid(),diagnostic_id uuid,actor text,status text,created_at timestamptz default now(),event_type text,old_status text,metadata jsonb);
 insert into auth.users values('${ids.admin}'),('${ids.user}'),('${ids.otherUser}');insert into admin_users values('${ids.admin}',true);
 insert into partners(id,company_name,email) values('${ids.a}','TEST Diffusion A','a@example.invalid'),('${ids.b}','TEST Diffusion B','b@example.invalid');
 insert into partner_users(partner_id,user_id,role,active) values('${ids.a}','${ids.user}','owner',true),('${ids.b}','${ids.otherUser}','owner',true);
 insert into partner_departments(partner_id,department) values('${ids.a}','67'),('${ids.b}','67');
 insert into customers(id,name,phone,email,address,spa_brand,spa_year,installation_type,power_supply) values('${ids.customer}','TEST Diffusion','0000000000','client@example.invalid','TEST','TEST','2020','exterieur','230V');
 insert into diagnostics(id,customer_id,problem_type,choice,department,matched_partner_ids) values('${ids.d}','${ids.customer}','fuite','intervention','67',array['${ids.a}'::uuid,'${ids.b}'::uuid]);`);
 for(const file of ['supabase/migrations/20260908_02_submission.sql','supabase/migrations/20260911111209_partner_billing_terms.sql','supabase/migrations/20260911114257_partner_manual_release.sql',migration]) await db.exec(await readFile(file,'utf8'));
 await db.exec('grant usage on schema public to service_role;grant all on all tables in schema public to service_role;');
 return db;
}
export const releaseJob=(partner=ids.a)=>({diagnosticId:ids.d,partners:[{id:partner,email:partner===ids.a?'a@example.invalid':'b@example.invalid',companyName:'TEST Diffusion'}],problemType:'fuite',department:'67',postalCode:'',city:'',answers:[]});
