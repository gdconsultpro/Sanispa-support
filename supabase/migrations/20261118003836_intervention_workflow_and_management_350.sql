begin;
create table public.partner_charter_acceptances (
 partner_id uuid not null references public.partners(id), version text not null,
 accepted_by uuid not null references auth.users(id), accepted_at timestamptz not null default now(),
 primary key(partner_id,version)
);
alter table public.partner_charter_acceptances enable row level security;
revoke all on public.partner_charter_acceptances from public,anon,authenticated;
grant all on public.partner_charter_acceptances to service_role;
create function public.accept_partner_charter(p_partner uuid,p_actor uuid,p_version text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_version is distinct from 'recette-2026-11-18' then raise exception 'INVALID_CHARTER';end if;
 if not exists(select 1 from public.partner_users u join public.partners p on p.id=u.partner_id where u.partner_id=p_partner and u.user_id=p_actor and u.active and p.active and u.role='owner') then raise exception 'PARTNER_OWNER_REQUIRED';end if;
 insert into public.partner_charter_acceptances(partner_id,version,accepted_by) values(p_partner,p_version,p_actor) on conflict(partner_id,version) do nothing;
end;$$;
revoke all on function public.accept_partner_charter(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.accept_partner_charter(uuid,uuid,text) to service_role;
-- New sales: one offer, 350 EUR TTC. Historical TEST invoices keep their terms.
alter table public.partner_subscription_checkouts add column amount integer check(amount>0);
update public.partner_subscription_checkouts set amount=case plan when 'complete' then 70000 else 30000 end;
update public.partner_subscription_checkouts set state='expired' where state='pending' and stripe_session_id is null;
create or replace function public.prepare_partner_subscription(p_partner uuid,p_actor uuid,p_plan text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.partner_subscription_checkouts;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_partner::text,900));
 perform 1 from public.partner_users u join public.partners p on p.id=u.partner_id where u.partner_id=p_partner and u.user_id=p_actor and u.active and p.active;
 if not found then raise exception 'PARTNER_REQUIRED';end if;
 if p_plan is distinct from 'management' then raise exception 'INVALID_PLAN';end if;
 if not exists(select 1 from public.partner_charter_acceptances where partner_id=p_partner and version='recette-2026-11-18') then raise exception 'CHARTER_REQUIRED';end if;
 if exists(select 1 from public.partner_subscriptions where partner_id=p_partner and (status in ('active','past_due','review') or paid_until>now())) then raise exception 'SUBSCRIPTION_EXISTS';end if;
 select * into c from public.partner_subscription_checkouts where partner_id=p_partner and state='pending' for update;
 if c.id is null then insert into public.partner_subscription_checkouts(partner_id,plan,amount) values(p_partner,'management',35000) returning * into c;
 elsif c.plan<>p_plan then raise exception 'CHECKOUT_PENDING';end if;
 return to_jsonb(c);
end;$$;
create or replace function public.catalog_lead_amount(category text) returns int language sql immutable set search_path='' as $$
 select case category when 'fuite' then 2500 when 'pompe' then 5900 when 'electrique' then 4900
 when 'carte-mere' then 6900 when 'intemperies' then 8900 when 'chauffage' then 4900
 when 'filtration' then 4900 when 'clavier-ecran' then 3900 when 'autre' then 2000 when 'demenagement' then 5000 else null end;
$$;

alter table public.client_documents drop constraint client_documents_issued_by_check;
alter table public.client_documents add constraint client_documents_issued_by_check check(issued_by in ('client','sanispa','partner'));
alter table public.client_documents add column issuer_partner_id uuid references public.partners(id);
alter table public.client_documents add constraint partner_document_issuer check((issued_by='partner')=(issuer_partner_id is not null));
create index client_documents_issuer_partner on public.client_documents(issuer_partner_id) where issuer_partner_id is not null;

create table public.partner_appointments (
 diagnostic_id uuid primary key references public.diagnostics(id), partner_id uuid not null references public.partners(id),
 starts_at timestamptz not null, ends_at timestamptz not null, updated_at timestamptz not null default now(),
 check(ends_at>starts_at and ends_at<=starts_at+interval '12 hours')
);
create table public.intervention_reports (
 id uuid primary key, diagnostic_id uuid not null references public.diagnostics(id), partner_id uuid not null references public.partners(id),
 author_id uuid not null references auth.users(id), performed_at timestamptz not null, findings text not null check(length(btrim(findings)) between 20 and 5000),
 actions text not null check(length(btrim(actions)) between 20 and 5000), next_steps text not null check(length(btrim(next_steps)) between 5 and 3000),
 submitted_at timestamptz not null default now(), client_validated_at timestamptz,
 client_outcome text check(client_outcome in ('repaired','quote_pending','abandoned')),
 responsiveness int check(responsiveness between 1 and 5), professionalism int check(professionalism between 1 and 5), pricing int check(pricing between 1 and 5),
 check((client_validated_at is null and client_outcome is null and responsiveness is null and professionalism is null and pricing is null)
 or (client_validated_at is not null and client_outcome is not null and responsiveness is not null and professionalism is not null and pricing is not null))
);
create unique index one_pending_intervention_report on public.intervention_reports(diagnostic_id) where client_validated_at is null;
create index intervention_reports_diagnostic on public.intervention_reports(diagnostic_id,submitted_at desc);
create index intervention_reports_partner on public.intervention_reports(partner_id);
create index intervention_reports_author on public.intervention_reports(author_id);
create index partner_appointments_partner on public.partner_appointments(partner_id,starts_at);
create index partner_charter_accepted_by on public.partner_charter_acceptances(accepted_by);

create function public.save_partner_appointment(p_diagnostic uuid,p_partner uuid,p_actor uuid,p_start timestamptz,p_end timestamptz) returns void
language plpgsql security invoker set search_path='' as $$
declare d public.diagnostics;
begin
 select * into d from public.diagnostics where id=p_diagnostic for update;
 if d.id is null or d.assigned_partner_id is distinct from p_partner or d.archived_at is not null or d.status in ('CLOSED','terminé')
 or not exists(select 1 from public.partner_users u join public.partners p on p.id=u.partner_id where u.partner_id=p_partner and u.user_id=p_actor and u.active and p.active) then raise exception 'ASSIGNED_PARTNER_REQUIRED';end if;
 if p_start is null or p_end is null or p_start<now()-interval '5 minutes' then raise exception 'APPOINTMENT_IN_PAST';end if;
 insert into public.partner_appointments(diagnostic_id,partner_id,starts_at,ends_at) values(d.id,p_partner,p_start,p_end)
 on conflict(diagnostic_id) do update set partner_id=excluded.partner_id,starts_at=excluded.starts_at,ends_at=excluded.ends_at,updated_at=now();
 insert into public.diagnostic_activity(diagnostic_id,actor,status,event_type,metadata) values(d.id,p_actor::text,d.status,'appointment_scheduled',jsonb_build_object('starts_at',p_start,'ends_at',p_end));
end;$$;

create function public.submit_intervention_report(p_id uuid,p_diagnostic uuid,p_partner uuid,p_actor uuid,p_performed timestamptz,p_findings text,p_actions text,p_next text,p_on_site boolean) returns uuid
language plpgsql security invoker set search_path='' as $$
declare d public.diagnostics; r public.intervention_reports; email text; k text;
begin
 select * into d from public.diagnostics where id=p_diagnostic for update;
 if d.id is null or d.assigned_partner_id is distinct from p_partner or d.archived_at is not null
 or not exists(select 1 from public.partner_users u join public.partners p on p.id=u.partner_id where u.partner_id=p_partner and u.user_id=p_actor and u.active and p.active) then raise exception 'ASSIGNED_PARTNER_REQUIRED';end if;
 select * into r from public.intervention_reports where id=p_id;
 if r.id is not null then
  if r.diagnostic_id=d.id and r.partner_id=p_partner and r.author_id=p_actor and r.performed_at=p_performed and r.findings=p_findings and r.actions=p_actions and r.next_steps=p_next then return r.id;end if;
  raise exception 'REPORT_CONFLICT';
 end if;
 if d.user_id is null then raise exception 'CLIENT_ACCOUNT_REQUIRED';end if;
 if d.status in ('CLOSED','terminé') then raise exception 'CASE_CLOSED';end if;
 if not exists(select 1 from public.partner_appointments where diagnostic_id=d.id and partner_id=p_partner and starts_at<=p_performed+interval '30 minutes' and ends_at>=p_performed-interval '12 hours') then raise exception 'APPOINTMENT_REQUIRED';end if;
 if p_on_site is distinct from true or p_performed is null or p_performed>now()+interval '5 minutes' or p_performed<d.created_at then raise exception 'ON_SITE_REPORT_REQUIRED';end if;
 insert into public.intervention_reports(id,diagnostic_id,partner_id,author_id,performed_at,findings,actions,next_steps)
 values(p_id,d.id,p_partner,p_actor,p_performed,p_findings,p_actions,p_next);
 update public.diagnostics set intervened_at=p_performed,intervened_partner_id=p_partner,
 intervened_company_name=(select company_name from public.partners where id=p_partner) where id=d.id;
 select u.email into email from auth.users u where u.id=d.user_id;
 k:='report:'||p_id;
 insert into public.notification_jobs(key,kind,payload) values(k,'client_report',jsonb_build_object('diagnosticId',d.id,'reportId',p_id,'email',email,'notificationKey',k));
 insert into public.diagnostic_activity(diagnostic_id,actor,status,event_type,metadata) values(d.id,p_actor::text,d.status,'intervention_report_submitted',jsonb_build_object('report_id',p_id));
 return p_id;
end;$$;

create function public.validate_intervention_report(p_report uuid,p_actor uuid,p_outcome text,p_responsiveness int,p_professionalism int,p_pricing int) returns void
language plpgsql security invoker set search_path='' as $$
declare r public.intervention_reports; d public.diagnostics;
begin
 -- Same lock order as partner submission to serialize concurrent requests.
 select x.* into d from public.diagnostics x join public.intervention_reports y on y.diagnostic_id=x.id where y.id=p_report for update of x;
 select * into r from public.intervention_reports where id=p_report for update;
 if d.id is null or d.user_id is distinct from p_actor or d.archived_at is not null then raise exception 'CLIENT_REQUIRED';end if;
 if r.client_validated_at is not null then
  if r.client_outcome=p_outcome and r.responsiveness=p_responsiveness and r.professionalism=p_professionalism and r.pricing=p_pricing then return;end if;
  raise exception 'ALREADY_VALIDATED';
 end if;
 if p_outcome not in ('repaired','quote_pending','abandoned') or p_outcome is null or p_responsiveness is null or p_professionalism is null or p_pricing is null then raise exception 'COMPLETE_REVIEW_REQUIRED';end if;
 if p_outcome='repaired' and not exists(select 1 from public.client_documents where diagnostic_id=d.id and document_type='Facture d’intervention' and issued_by in ('partner','sanispa')) then raise exception 'INVOICE_REQUIRED';end if;
 update public.intervention_reports set client_validated_at=now(),client_outcome=p_outcome,responsiveness=p_responsiveness,professionalism=p_professionalism,pricing=p_pricing where id=p_report;
 update public.diagnostics set status=case when p_outcome='quote_pending' then 'devis envoyé' else 'CLOSED' end where id=d.id;
 update public.notification_jobs set state='cancelled',locked_until=null where kind in ('client_report','client_review_reminder') and payload->>'reportId'=p_report::text and state='pending';
 insert into public.diagnostic_activity(diagnostic_id,actor,status,event_type,metadata) values(d.id,p_actor::text,d.status,'client_intervention_validated',jsonb_build_object('report_id',p_report,'outcome',p_outcome));
end;$$;

create function public.queue_client_review_reminders() returns int language plpgsql security invoker set search_path='' as $$
declare n int;
begin
 insert into public.notification_jobs(key,kind,payload)
 select 'review-reminder:'||r.id,'client_review_reminder',jsonb_build_object('diagnosticId',r.diagnostic_id,'reportId',r.id,'email',u.email,'notificationKey','review-reminder:'||r.id)
 from public.intervention_reports r join public.diagnostics d on d.id=r.diagnostic_id join auth.users u on u.id=d.user_id
 where r.client_validated_at is null and r.submitted_at<now()-interval '3 days' and d.archived_at is null
 on conflict(key) do nothing;
 get diagnostics n=row_count; return n;
end;$$;

create function public.register_partner_invoice(p_id uuid,p_diagnostic uuid,p_partner uuid,p_actor uuid,p_name text,p_size int,p_path text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare d public.diagnostics;
begin
 select * into d from public.diagnostics where id=p_diagnostic for update;
 if d.id is null or d.user_id is null or d.assigned_partner_id is distinct from p_partner or d.archived_at is not null
 or not exists(select 1 from public.partner_users u join public.partners p on p.id=u.partner_id where u.partner_id=p_partner and u.user_id=p_actor and u.active and p.active) then raise exception 'ASSIGNED_PARTNER_REQUIRED';end if;
 if p_path is null or p_path<>d.user_id::text||'/'||p_id::text||'.pdf' or p_size not between 1 and 3145728 or char_length(p_name) not between 1 and 180 then raise exception 'INVALID_DOCUMENT';end if;
 insert into public.client_documents(id,user_id,spa_id,diagnostic_id,document_type,file_name,mime_type,file_size,storage_bucket,storage_path,issued_by,issuer_partner_id)
 values(p_id,d.user_id,d.spa_id,d.id,'Facture d’intervention',p_name,'application/pdf',p_size,'client-documents',p_path,'partner',p_partner);
 return p_id;
end;$$;
revoke all on function public.register_partner_invoice(uuid,uuid,uuid,uuid,text,int,text) from public,anon,authenticated;
grant execute on function public.register_partner_invoice(uuid,uuid,uuid,uuid,text,int,text) to service_role;

create or replace function public.claim_notifications(p_key text default null) returns setof public.notification_jobs
language sql security invoker set search_path='' as $$
 update public.notification_jobs set locked_until=now()+interval '2 minutes',attempts=attempts+1,
 first_delivery_attempt_at=case when kind in ('partner','partner_accepted','client_report','client_review_reminder') then coalesce(first_delivery_attempt_at,case when attempts>0 then created_at else now() end) else first_delivery_attempt_at end
 where id in (select id from public.notification_jobs where state='pending' and (locked_until is null or locked_until<now())
 and (p_key is null or key like p_key||'%') order by created_at limit 10 for update skip locked) returning *;
$$;

-- Durable transfer queue: recording a declaration never depends on the remote API.
-- No network worker is activated by this migration. No existing real dossiers are backfilled.
create table public.synchroteam_exports (
 diagnostic_id uuid primary key references public.diagnostics(id), external_key text not null unique,
 state text not null default 'pending' check(state in ('pending','sent','review')),
 remote_job_id text, attempts int not null default 0, last_attempt_at timestamptz, sent_at timestamptz,
 created_at timestamptz not null default now()
);
create function private.enqueue_synchroteam_declaration() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.synchroteam_exports(diagnostic_id,external_key) values(new.id,'sanispa:'||new.id) on conflict(diagnostic_id) do nothing;
 return new;
end;$$;
revoke all on function private.enqueue_synchroteam_declaration() from public,anon,authenticated;
create trigger enqueue_synchroteam_declaration after insert on public.diagnostics for each row execute function private.enqueue_synchroteam_declaration();

alter table public.partner_appointments enable row level security;
alter table public.intervention_reports enable row level security;
alter table public.synchroteam_exports enable row level security;
revoke all on public.partner_appointments,public.intervention_reports,public.synchroteam_exports from public,anon,authenticated;
grant all on public.partner_appointments,public.intervention_reports,public.synchroteam_exports to service_role;
revoke all on function public.save_partner_appointment(uuid,uuid,uuid,timestamptz,timestamptz),public.submit_intervention_report(uuid,uuid,uuid,uuid,timestamptz,text,text,text,boolean),public.validate_intervention_report(uuid,uuid,text,int,int,int),public.queue_client_review_reminders() from public,anon,authenticated;
grant execute on function public.save_partner_appointment(uuid,uuid,uuid,timestamptz,timestamptz),public.submit_intervention_report(uuid,uuid,uuid,uuid,timestamptz,text,text,text,boolean),public.validate_intervention_report(uuid,uuid,text,int,int,int),public.queue_client_review_reminders() to service_role;
commit;
