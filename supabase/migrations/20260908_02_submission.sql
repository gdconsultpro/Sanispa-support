begin;
create table if not exists public.notification_jobs (
 id uuid primary key default gen_random_uuid(), key text unique not null, kind text not null,
 payload jsonb not null, state text not null default 'pending', attempts int not null default 0,
 locked_until timestamptz, sent_at timestamptz, created_at timestamptz not null default now()
);
alter table public.notification_jobs enable row level security;
create or replace function public.claim_notifications(p_key text default null) returns setof public.notification_jobs
language sql security definer set search_path=public as $$
 update notification_jobs set locked_until=now()+interval '2 minutes',attempts=attempts+1
 where id in (select id from notification_jobs where state='pending' and (locked_until is null or locked_until<now())
 and (p_key is null or key like p_key||'%') order by created_at limit 10 for update skip locked) returning *;
$$;
create or replace function public.submit_diagnostic(p_id uuid,p_user uuid,p_version int,p_department text,p_partners uuid[],p_answers jsonb,p_photos jsonb,p_jobs jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare d diagnostic_drafts; p jsonb; customer uuid; water boolean; x jsonb;
begin
 select * into d from diagnostic_drafts where id=p_id and user_id=p_user for update;
 if d.id is null then raise exception 'DRAFT_NOT_FOUND'; end if;
 if d.submitted_at is not null then return d.id; end if;
 if d.version<>p_version then raise exception 'DRAFT_CONFLICT'; end if;
 p:=d.payload; water:=p->>'problemType'='traitement-eau' and p->>'choice'='remote';
 insert into customers(name,phone,email,address,spa_brand,spa_model,spa_year,installation_type,power_supply)
 values(p->>'name',p->>'phone',p->>'email',concat_ws(' - ',nullif(p->>'address',''),p->>'postalCode',p->>'city'),
 coalesce(nullif(p->>'spaBrand',''),'Non renseignée'),p->>'spaModel',coalesce(nullif(p->>'spaYear',''),'Non renseignée'),p->>'installationType',
 case when p->'answers'->>'power_supply_known' in ('230V','400V') then p->'answers'->>'power_supply_known' else coalesce(nullif(p->>'powerSupply',''),'je ne sais pas') end) returning id into customer;
 insert into diagnostics(id,customer_id,user_id,spa_id,problem_type,request_type,department,matched_partner_ids,status,choice,payment_plan,customer_email_status)
 values(d.id,customer,p_user,nullif(p->>'spaId','')::uuid,p->>'problemType',case when water then 'WATER_ANALYSIS' else 'TECHNICAL_REQUEST' end,
 p_department,p_partners,case when water then 'WATER_ANALYSIS' else 'AVAILABLE' end,p->>'choice',case when water then 'water' else null end,'pending');
 for x in select value from jsonb_array_elements(p_answers) loop
 insert into diagnostic_answers(diagnostic_id,question_key,question_label,answer) values(d.id,x->>'question_key',x->>'question_label',x->>'answer'); end loop;
 for x in select value from jsonb_array_elements(p_photos) loop
 insert into diagnostic_photos(diagnostic_id,photo_type,storage_path,public_url) values(d.id,x->>'photo_type',x->>'storage_path',null); end loop;
 for x in select value from jsonb_array_elements(p_jobs) loop
 insert into notification_jobs(key,kind,payload) values(x->>'key',x->>'kind',x->'payload') on conflict(key) do nothing; end loop;
 update diagnostic_drafts set submitted_at=now(),payload=payload-'photos',updated_at=now() where id=d.id;
 return d.id;
end; $$;
revoke all on function public.submit_diagnostic(uuid,uuid,int,text,uuid[],jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.submit_diagnostic(uuid,uuid,int,text,uuid[],jsonb,jsonb,jsonb) to service_role;
revoke all on function public.claim_notifications(text) from public,anon,authenticated;
grant execute on function public.claim_notifications(text) to service_role;
commit;
