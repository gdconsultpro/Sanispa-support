begin;
-- Additive migration. Existing purchases and documents are retained.
alter table public.client_documents add column issued_by text not null default 'client' check (issued_by in ('client','sanispa'));
alter table public.diagnostics add column offer_version int not null default 1,
 add column lead_category text, add column lead_amount integer,
 add column preview_description text, add column preview_photo_paths text[] not null default '{}',
 add column intervened_partner_id uuid references public.partners(id), add column intervened_company_name text,
 add column intervened_at timestamptz;
create table public.partner_subscriptions (
 partner_id uuid primary key references public.partners(id),
 plan text not null check(plan in ('management','complete')),
 status text not null check(status in ('active','past_due','canceled','review')),
 stripe_subscription_id text not null unique, stripe_customer_id text not null,
 paid_until timestamptz not null, event_created bigint not null
);
create table public.partner_subscription_checkouts (
 id uuid primary key default gen_random_uuid(),partner_id uuid not null references public.partners(id),
 plan text not null check(plan in ('management','complete')),stripe_session_id text unique,
 state text not null default 'pending' check(state in ('pending','complete','expired')),
 created_at timestamptz not null default now()
);
create unique index one_pending_subscription on public.partner_subscription_checkouts(partner_id) where state='pending';
alter table public.partner_subscriptions enable row level security;
alter table public.partner_subscription_checkouts enable row level security;
revoke all on public.partner_subscriptions,public.partner_subscription_checkouts from public,anon,authenticated;
grant all on public.partner_subscriptions,public.partner_subscription_checkouts to service_role;

create function public.catalog_lead_amount(category text) returns int language sql immutable set search_path='' as $$
 select case category when 'fuite' then 2500 when 'pompe' then 5900 when 'electrique' then 4900
 when 'carte-mere' then 6900 when 'intemperies' then 8900 when 'chauffage' then 4900
 when 'filtration' then 4900 when 'clavier-ecran' then 3900 when 'autre' then 2000 else null end;
$$;
revoke all on function public.catalog_lead_amount(text) from public,anon,authenticated;
grant execute on function public.catalog_lead_amount(text) to service_role;

create function public.publish_partner_offer(p_diagnostic uuid,p_partner uuid,p_actor uuid,p_category text,p_description text,p_photos text[])
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.diagnostics; p public.partners; amount int; k text;
begin
 perform 1 from public.admin_users where user_id=p_actor and active;
 if not found then raise exception 'ADMIN_REQUIRED'; end if;
 select * into d from public.diagnostics where id=p_diagnostic for update;
 if d.id is null or d.request_type<>'TECHNICAL_REQUEST' or d.archived_at is not null
 or d.status not in ('NEW','AVAILABLE','nouvelle') or d.partner_kept_at is not null
 or d.partner_released_at is not null or d.assigned_partner_id is not null
 or exists(select 1 from public.lead_purchases where request_id=d.id and status in ('pending','paid','granted')) then raise exception 'RELEASE_UNAVAILABLE';end if;
 select x.* into p from public.partners x join public.partner_departments pd on pd.partner_id=x.id
 where x.id=p_partner and x.active and pd.department=d.department for share of x;
 if p.id is null then raise exception 'PARTNER_INELIGIBLE';end if;
 amount:=public.catalog_lead_amount(p_category);
 if amount is null or char_length(btrim(p_description)) not between 20 and 1500 or cardinality(p_photos)>5
 or exists(select 1 from unnest(p_photos) path where not exists(select 1 from public.diagnostic_photos where diagnostic_id=d.id and storage_path=path)) then raise exception 'INVALID_PREVIEW';end if;
 update public.diagnostics set offer_version=2,lead_category=p_category,lead_amount=amount,
 preview_description=p_description,preview_photo_paths=p_photos,matched_partner_ids=array[p.id],partner_released_at=now(),partner_released_by=p_actor where id=d.id;
 k:=d.id||':manual-partner:'||p.id;
 insert into public.notification_jobs(key,kind,payload) values(k,'partner',jsonb_build_object('diagnosticId',d.id,'notificationKey',k,
 'partners',jsonb_build_array(jsonb_build_object('id',p.id,'companyName',p.company_name,'contactName',p.contact_name,'email',p.email)),
 'problemType',d.problem_type,'department',d.department,'postalCode','','city','','answers','[]'::jsonb)) on conflict(key) do nothing;
 insert into public.diagnostic_activity(diagnostic_id,actor,status,event_type,metadata) values(d.id,p_actor::text,d.status,'partner_released',jsonb_build_object('partner_id',p.id,'category',p_category,'amount',amount,'currency','eur','tax_basis','TTC'));
 return jsonb_build_object('released',true,'notificationKey',k);
end;$$;

create function public.acquire_partner_offer(p_diagnostic uuid,p_partner uuid,p_actor uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare d public.diagnostics;p public.partners;s public.partner_subscriptions;b public.lead_purchases;k text;
begin
 select * into d from public.diagnostics where id=p_diagnostic for update;
 select * into p from public.partners where id=p_partner and active for share;
 perform 1 from public.partner_users where partner_id=p_partner and user_id=p_actor and active for share;
 if not found or p.id is null then raise exception 'PARTNER_REQUIRED';end if;
 if d.assigned_partner_id=p_partner then return jsonb_build_object('kind','assigned');end if;
 if d.id is null or d.offer_version<>2 or d.assigned_partner_id is not null or d.archived_at is not null
 or d.request_type<>'TECHNICAL_REQUEST' or d.status not in ('NEW','AVAILABLE','nouvelle')
 or d.partner_released_at is null or d.partner_kept_at is not null or d.matched_partner_ids<>array[p_partner] then raise exception 'LEAD_UNAVAILABLE';end if;
 select * into s from public.partner_subscriptions where partner_id=p_partner for share;
 if s.partner_id is null or s.status<>'active' or s.paid_until<=now() then raise exception 'SUBSCRIPTION_REQUIRED';end if;
 if exists(select 1 from public.lead_purchases where request_id=d.id and status in ('paid','granted')) then raise exception 'LEAD_UNAVAILABLE';end if;
 if exists(select 1 from public.lead_purchases where request_id=d.id and status='pending' and partner_id<>p_partner) then raise exception 'LEAD_RESERVED';end if;
 select * into b from public.lead_purchases where request_id=d.id and partner_id=p_partner and status='pending' order by purchased_at limit 1 for update;
 if b.id is not null then return jsonb_build_object('kind','checkout','purchase',to_jsonb(b));end if;
 if d.lead_amount is distinct from public.catalog_lead_amount(d.lead_category) then raise exception 'INVALID_PRICE';end if;
 if s.plan='complete' then
 insert into public.lead_purchases(request_id,partner_id,status,payment_required,amount,currency) values(d.id,p_partner,'granted',false,0,'eur');
 update public.diagnostics set assigned_partner_id=p_partner,assigned_at=now(),status='ASSIGNED',lead_locked_until=null where id=d.id;
 k:='accepted:'||d.id;
 insert into public.notification_jobs(key,kind,payload) values(k,'partner_accepted',jsonb_build_object('diagnosticId',d.id,'partnerName',p.company_name,'notificationKey',k)) on conflict(key) do nothing;
 insert into public.diagnostic_activity(diagnostic_id,actor,status,event_type,metadata) values(d.id,p_actor::text,'ASSIGNED','partner_assigned',jsonb_build_object('partner_id',p_partner,'plan','complete'));
 return jsonb_build_object('kind','assigned');
 end if;
 insert into public.lead_purchases(request_id,partner_id,status,payment_required,amount,currency,stripe_price_id,locked_until)
 values(d.id,p_partner,'pending',true,d.lead_amount,'eur','catalog:v2:'||d.lead_category,now()+interval '15 minutes') returning * into b;
 update public.diagnostics set lead_locked_until=b.locked_until where id=d.id;
 return jsonb_build_object('kind','checkout','purchase',to_jsonb(b));
end;$$;

create function public.prepare_partner_subscription(p_partner uuid,p_actor uuid,p_plan text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.partner_subscription_checkouts;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_partner::text,900));
 perform 1 from public.partner_users u join public.partners p on p.id=u.partner_id where u.partner_id=p_partner and u.user_id=p_actor and u.active and p.active;
 if not found then raise exception 'PARTNER_REQUIRED';end if;
 if p_plan not in ('management','complete') or p_plan is null then raise exception 'INVALID_PLAN';end if;
 if exists(select 1 from public.partner_subscriptions where partner_id=p_partner and (status in ('active','past_due') or paid_until>now())) then raise exception 'SUBSCRIPTION_EXISTS';end if;
 select * into c from public.partner_subscription_checkouts where partner_id=p_partner and state='pending' for update;
 if c.id is null then insert into public.partner_subscription_checkouts(partner_id,plan) values(p_partner,p_plan) returning * into c;
 elsif c.plan<>p_plan then raise exception 'CHECKOUT_PENDING';end if;
 return to_jsonb(c);
end;$$;

create function public.record_partner_subscription(p_partner uuid,p_plan text,p_subscription text,p_customer text,p_status text,p_until timestamptz,p_event bigint)
returns void language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_partner::text,900));
 -- A verified checkout created by an authenticated partner is mandatory.
 if not exists(select 1 from public.partner_subscription_checkouts where partner_id=p_partner and plan=p_plan and stripe_session_id is not null) then raise exception 'CHECKOUT_NOT_FOUND';end if;
 insert into public.partner_subscriptions values(p_partner,p_plan,p_status,p_subscription,p_customer,p_until,p_event)
 on conflict(partner_id) do update set plan=excluded.plan,status=case when public.partner_subscriptions.status='review' then 'review' else excluded.status end,stripe_subscription_id=excluded.stripe_subscription_id,
 stripe_customer_id=excluded.stripe_customer_id,paid_until=excluded.paid_until,event_created=excluded.event_created
 where public.partner_subscriptions.event_created<=excluded.event_created;
 update public.partner_subscription_checkouts set state='complete' where partner_id=p_partner and plan=p_plan and state='pending';
end;$$;

-- Old acquisitions retain their terms; new applications cannot bypass v2 with the old RPC.
alter function public.prepare_partner_acquisition(uuid,uuid,uuid,text,integer,text) set schema private;
create function public.prepare_partner_acquisition(p_diagnostic uuid,p_partner uuid,p_actor uuid,p_price_id text default null,p_amount integer default null,p_currency text default 'eur') returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.diagnostics where id=p_diagnostic and assigned_partner_id=p_partner)
 or exists(select 1 from public.lead_purchases where request_id=p_diagnostic and partner_id=p_partner and status='pending') then
 return private.prepare_partner_acquisition(p_diagnostic,p_partner,p_actor,p_price_id,p_amount,p_currency);end if;
 raise exception 'LEAD_UNAVAILABLE';
end;$$;
alter function public.submit_diagnostic(uuid,uuid,int,text,uuid[],jsonb,jsonb,jsonb) set schema private;
create function public.submit_diagnostic(p_id uuid,p_user uuid,p_version int,p_department text,p_partners uuid[],p_answers jsonb,p_photos jsonb,p_jobs jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
begin
 return private.submit_diagnostic(p_id,p_user,p_version,p_department,'{}'::uuid[],p_answers,p_photos,
 coalesce((select jsonb_agg(job) from jsonb_array_elements(p_jobs) job where job->>'kind'<>'partner'),'[]'::jsonb));
end;$$;
-- Send exactly one administrative acceptance notification after assignment, never on Checkout return.
alter function public.apply_partner_payment(text,uuid,uuid,uuid,text,timestamptz) set schema private;
create function public.apply_partner_payment(p_session text,p_purchase uuid,p_partner uuid,p_diagnostic uuid,p_intent text,p_paid_at timestamptz) returns void
language plpgsql security invoker set search_path='' as $$
declare k text;name text;
begin
 perform private.apply_partner_payment(p_session,p_purchase,p_partner,p_diagnostic,p_intent,p_paid_at);
 select company_name into name from public.partners where id=p_partner;
 k:='accepted:'||p_diagnostic;
 insert into public.notification_jobs(key,kind,payload) values(k,'partner_accepted',jsonb_build_object('diagnosticId',p_diagnostic,'partnerName',name,'notificationKey',k)) on conflict(key) do nothing;
end;$$;

grant usage on schema private to service_role;
revoke all on function public.publish_partner_offer(uuid,uuid,uuid,text,text,text[]),public.acquire_partner_offer(uuid,uuid,uuid),public.prepare_partner_subscription(uuid,uuid,text),public.record_partner_subscription(uuid,text,text,text,text,timestamptz,bigint),public.prepare_partner_acquisition(uuid,uuid,uuid,text,int,text),public.submit_diagnostic(uuid,uuid,int,text,uuid[],jsonb,jsonb,jsonb),public.apply_partner_payment(text,uuid,uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.publish_partner_offer(uuid,uuid,uuid,text,text,text[]),public.acquire_partner_offer(uuid,uuid,uuid),public.prepare_partner_subscription(uuid,uuid,text),public.record_partner_subscription(uuid,text,text,text,text,timestamptz,bigint),public.prepare_partner_acquisition(uuid,uuid,uuid,text,int,text),public.submit_diagnostic(uuid,uuid,int,text,uuid[],jsonb,jsonb,jsonb),public.apply_partner_payment(text,uuid,uuid,uuid,text,timestamptz) to service_role;
create or replace function public.keep_partner_intervention(p_diagnostic uuid,p_actor uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.diagnostics;
begin
  perform 1 from public.admin_users where user_id=p_actor and active;
  if not found then raise exception 'ADMIN_REQUIRED'; end if;
  select * into d from public.diagnostics where id=p_diagnostic for update;
  if d.id is null or d.request_type is distinct from 'TECHNICAL_REQUEST'
    or d.archived_at is not null then raise exception 'DECISION_UNAVAILABLE'; end if;
  if d.partner_kept_at is not null then return jsonb_build_object('kept',true,'alreadyKept',true); end if;
  if d.partner_released_at is not null then raise exception 'ALREADY_RELEASED'; end if;
  if d.assigned_partner_id is not null or exists(select 1 from public.lead_purchases
    where request_id=d.id and status in ('pending','paid','granted')) then raise exception 'ACQUISITION_STARTED'; end if;
  update public.diagnostics set partner_kept_at=now(),partner_kept_by=p_actor,matched_partner_ids='{}' where id=d.id;
  insert into public.diagnostic_activity(diagnostic_id,actor,status,event_type,old_status,metadata)
    values(d.id,p_actor::text,d.status,'partner_kept',d.status,jsonb_build_object('decision','internal','partner_id',null));
  -- Stop any old unsent partner jobs; client/internal confirmations are untouched.
  update public.notification_jobs set state='cancelled',locked_until=null
    where kind='partner' and payload->>'diagnosticId'=d.id::text and state='pending';
  return jsonb_build_object('kept',true,'alreadyKept',false);
end;
$$;
create function public.record_intervention(p_diagnostic uuid,p_actor uuid,p_partner uuid,p_at timestamptz) returns void language plpgsql security invoker set search_path='' as $$
declare name text;
begin
 perform 1 from public.admin_users where user_id=p_actor and active;if not found then raise exception 'ADMIN_REQUIRED';end if;
 perform 1 from public.diagnostics where id=p_diagnostic for update;if not found then raise exception 'NOT_FOUND';end if;
 if p_at is null or p_at>now() then raise exception 'INVALID_INTERVENTION_DATE';end if;
 if p_partner is null then name:='SANISPA';else select company_name into name from public.partners where id=p_partner;if name is null then raise exception 'PARTNER_NOT_FOUND';end if;end if;
 update public.diagnostics set intervened_partner_id=p_partner,intervened_company_name=name,intervened_at=p_at where id=p_diagnostic;
 insert into public.diagnostic_activity(diagnostic_id,actor,status,event_type,metadata) values(p_diagnostic,p_actor::text,(select status from public.diagnostics where id=p_diagnostic),'intervention_completed',jsonb_build_object('company',name,'date',p_at));
end;$$;
revoke all on function public.record_intervention(uuid,uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.record_intervention(uuid,uuid,uuid,timestamptz) to service_role;
create or replace function public.claim_notifications(p_key text default null) returns setof public.notification_jobs
language sql security invoker set search_path='' as $$
 update public.notification_jobs set locked_until=now()+interval '2 minutes',attempts=attempts+1,
 first_delivery_attempt_at=case when kind in ('partner','partner_accepted') then coalesce(first_delivery_attempt_at,case when attempts>0 then created_at else now() end) else first_delivery_attempt_at end
 where id in (select id from public.notification_jobs where state='pending' and (locked_until is null or locked_until<now())
 and (p_key is null or key like p_key||'%') order by created_at limit 10 for update skip locked) returning *;
$$;
commit;
