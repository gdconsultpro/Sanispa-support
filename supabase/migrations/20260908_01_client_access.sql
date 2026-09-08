begin;
alter table public.diagnostics add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.diagnostics add column if not exists spa_id uuid references public.customer_spas(id) on delete set null;
create index if not exists diagnostics_user_idx on public.diagnostics(user_id);
-- Migrate only existing, confirmed identities. Email matching is never used to claim future records.
update public.diagnostics d set user_id = u.id from public.customers c, auth.users u
where d.customer_id=c.id and d.user_id is null and u.email_confirmed_at is not null and lower(trim(c.email))=lower(trim(u.email));
create table if not exists public.diagnostic_drafts (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 payload jsonb not null, step text not null check(step in ('/diagnostic','/questionnaire','/upload','/resume')),
 version integer not null default 1, updated_at timestamptz not null default now(), submitted_at timestamptz,
 check(octet_length(payload::text) <= 2400000)
);
alter table public.diagnostic_drafts enable row level security;
create index if not exists drafts_user_idx on public.diagnostic_drafts(user_id, updated_at desc);
create table if not exists public.request_limits (key text primary key, hits integer not null, resets_at timestamptz not null);
alter table public.request_limits enable row level security;
create or replace function public.consume_request_limit(p_key text,p_limit int,p_seconds int) returns boolean
language plpgsql security definer set search_path=public as $$
declare n int;
begin
 insert into request_limits values(p_key,1,now()+make_interval(secs=>p_seconds))
 on conflict(key) do update set hits=case when request_limits.resets_at<=now() then 1 else request_limits.hits+1 end,
 resets_at=case when request_limits.resets_at<=now() then now()+make_interval(secs=>p_seconds) else request_limits.resets_at end returning hits into n;
 return n<=p_limit;
end; $$;
create or replace function public.save_diagnostic_draft(p_id uuid,p_user uuid,p_version int,p_step text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare d diagnostic_drafts;
begin
 if p_version=0 then
  insert into diagnostic_drafts(id,user_id,payload,step) values(p_id,p_user,p_payload,p_step) on conflict(id) do nothing returning * into d;
 else
  update diagnostic_drafts set payload=p_payload,step=p_step,version=version+1,updated_at=now()
  where id=p_id and user_id=p_user and version=p_version and submitted_at is null returning * into d;
 end if;
 if d.id is null then raise exception 'DRAFT_CONFLICT'; end if;
 insert into client_profiles(user_id,email,first_name,last_name,phone,address,postal_code,city,spa_brand,spa_model,spa_year)
 values(p_user,p_payload->>'email',p_payload->>'name','',p_payload->>'phone',p_payload->>'address',p_payload->>'postalCode',p_payload->>'city',p_payload->>'spaBrand',p_payload->>'spaModel',p_payload->>'spaYear')
 on conflict(user_id) do nothing;
 return to_jsonb(d);
end; $$;
revoke all on function public.save_diagnostic_draft(uuid,uuid,int,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_diagnostic_draft(uuid,uuid,int,text,jsonb) to service_role;
revoke all on function public.consume_request_limit(text,int,int) from public,anon,authenticated;
grant execute on function public.consume_request_limit(text,int,int) to service_role;
-- Private storage. Existing public links stop working; the application signs authorized reads.
update storage.buckets set public=false where id='diagnostic-photos';
drop policy if exists "Public photo read access" on storage.objects;
insert into storage.buckets(id,name,public,file_size_limit) values('client-documents','client-documents',false,10485760) on conflict(id) do update set public=false;
-- Prevent clients from writing forged document relationships directly through PostgREST.
drop policy if exists "Users manage own client documents" on public.client_documents;
-- Remove redundant plaintext passwords; credential reset for affected users is a separate operational step.
update auth.users set raw_user_meta_data=raw_user_meta_data-'password' where raw_user_meta_data ? 'password';
commit;
