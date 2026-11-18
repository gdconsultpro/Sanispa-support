begin;

-- One reversible, server-only setting; no synthetic Stripe subscription or payment.
create table private.commercial_configuration (
 id boolean primary key default true check(id), payments_paused boolean not null default true
);
insert into private.commercial_configuration values(true,true);
alter table private.commercial_configuration enable row level security;
revoke all on private.commercial_configuration from public,anon,authenticated;
grant select,update on private.commercial_configuration to service_role;
create function public.commercial_payments_paused() returns boolean language sql stable security invoker set search_path='' as $$
 select coalesce((select payments_paused from private.commercial_configuration where id),true);
$$;
revoke all on function public.commercial_payments_paused() from public,anon,authenticated;
grant execute on function public.commercial_payments_paused() to service_role;

-- Granted only by the application after Auth verifies the session and confirmed e-mail.
-- Keep auth.users inaccessible to service_role; never introduce a fake subscription.
create table private.complimentary_customer_access (
 user_id uuid primary key references auth.users(id) on delete cascade,granted_at timestamptz not null default now()
);
alter table private.complimentary_customer_access enable row level security;
revoke all on private.complimentary_customer_access from public,anon,authenticated;
grant select,insert on private.complimentary_customer_access to service_role;

create or replace function public.customer_has_premium(p_user uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select (public.commercial_payments_paused() and exists(select 1 from private.complimentary_customer_access where user_id=p_user))
 or exists(select 1 from public.customer_subscriptions where user_id=p_user and status in ('active','canceled') and paid_until>now());
$$;
create function public.grant_customer_trial_access(p_user uuid) returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_user is null then raise exception 'USER_REQUIRED';end if;
 if public.commercial_payments_paused() then
  insert into private.complimentary_customer_access(user_id) values(p_user) on conflict(user_id) do nothing;
 end if;
 return public.customer_has_premium(p_user);
end;$$;
revoke all on function public.grant_customer_trial_access(uuid) from public,anon,authenticated;
grant execute on function public.grant_customer_trial_access(uuid) to service_role;

create or replace function private.mark_premium_water_request() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.request_type='WATER_ANALYSIS' then new.payment_status:=case when public.commercial_payments_paused() then 'complimentary' else 'subscription' end;end if;
 return new;
end;$$;

create or replace function public.accept_partner_charter(p_partner uuid,p_actor uuid,p_version text) returns void language plpgsql security invoker set search_path='' as $$
declare expected text;
begin
 expected:=case when public.commercial_payments_paused() then 'essai-gratuit-2026-11-18' else 'recette-2026-11-18' end;
 if p_version is distinct from expected then raise exception 'INVALID_CHARTER';end if;
 if not exists(select 1 from public.partner_users u join public.partners p on p.id=u.partner_id where u.partner_id=p_partner and u.user_id=p_actor and u.active and p.active and u.role='owner') then raise exception 'PARTNER_OWNER_REQUIRED';end if;
 insert into public.partner_charter_acceptances(partner_id,version,accepted_by) values(p_partner,p_version,p_actor) on conflict(partner_id,version) do nothing;
end;$$;

alter function public.prepare_customer_subscription(uuid) set schema private;
create function public.prepare_customer_subscription(p_user uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if public.commercial_payments_paused() then raise exception 'PAYMENTS_PAUSED';end if;
 return private.prepare_customer_subscription(p_user);
end;$$;
alter function public.prepare_partner_subscription(uuid,uuid,text) set schema private;
create function public.prepare_partner_subscription(p_partner uuid,p_actor uuid,p_plan text) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if public.commercial_payments_paused() then raise exception 'PAYMENTS_PAUSED';end if;
 return private.prepare_partner_subscription(p_partner,p_actor,p_plan);
end;$$;

alter function public.acquire_partner_offer(uuid,uuid,uuid) set schema private;
create function public.acquire_partner_offer(p_diagnostic uuid,p_partner uuid,p_actor uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.diagnostics;p public.partners;k text;
begin
 if not public.commercial_payments_paused() then return private.acquire_partner_offer(p_diagnostic,p_partner,p_actor);end if;
 select * into d from public.diagnostics where id=p_diagnostic for update;
 select * into p from public.partners where id=p_partner and active for share;
 perform 1 from public.partner_users where partner_id=p_partner and user_id=p_actor and active for share;
 if not found or p.id is null then raise exception 'PARTNER_REQUIRED';end if;
 if d.assigned_partner_id=p_partner then return jsonb_build_object('kind','assigned');end if;
 if d.id is null or d.offer_version<>2 or d.assigned_partner_id is not null or d.archived_at is not null
 or d.request_type<>'TECHNICAL_REQUEST' or d.status not in ('NEW','AVAILABLE','nouvelle')
 or d.partner_released_at is null or d.partner_kept_at is not null or d.matched_partner_ids<>array[p_partner] then raise exception 'LEAD_UNAVAILABLE';end if;
 if not exists(select 1 from public.partner_charter_acceptances where partner_id=p_partner and version='essai-gratuit-2026-11-18') then raise exception 'CHARTER_REQUIRED';end if;
 if exists(select 1 from public.lead_purchases where request_id=d.id and status in ('pending','paid','granted')) then raise exception 'LEAD_RESERVED';end if;
 insert into public.lead_purchases(request_id,partner_id,status,payment_required,amount,currency) values(d.id,p_partner,'granted',false,0,'eur');
 update public.diagnostics set assigned_partner_id=p_partner,assigned_at=now(),status='ASSIGNED',lead_locked_until=null where id=d.id;
 k:='accepted:'||d.id;
 insert into public.notification_jobs(key,kind,payload) values(k,'partner_accepted',jsonb_build_object('diagnosticId',d.id,'partnerName',p.company_name,'notificationKey',k)) on conflict(key) do nothing;
 insert into public.diagnostic_activity(diagnostic_id,actor,status,event_type,metadata) values(d.id,p_actor::text,'ASSIGNED','partner_assigned',jsonb_build_object('partner_id',p_partner,'commercial_mode','complimentary','amount',0));
 return jsonb_build_object('kind','assigned');
end;$$;
revoke all on function public.prepare_customer_subscription(uuid),public.prepare_partner_subscription(uuid,uuid,text),public.acquire_partner_offer(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_customer_subscription(uuid),public.prepare_partner_subscription(uuid,uuid,text),public.acquire_partner_offer(uuid,uuid,uuid) to service_role;

create table public.video_assistance_sessions (
 id uuid primary key default gen_random_uuid(),requester_id uuid not null references auth.users(id),
 requester_email text not null,audience text not null check(audience in ('customer','partner')),
 diagnostic_id uuid references public.diagnostics(id),partner_id uuid references public.partners(id),
 details text not null check(length(details) between 10 and 1500),availability text not null check(length(availability) between 3 and 500),
 duration_minutes integer not null default 30 check(duration_minutes=30),
 quoted_amount integer check(quoted_amount>=0),collected_amount integer not null default 0 check(collected_amount=0),
 billing_mode text not null check(billing_mode='complimentary'),
 status text not null default 'requested' check(status in ('requested','scheduled','completed','canceled')),
 starts_at timestamptz,meeting_url text check(meeting_url is null or (meeting_url ~ '^https://' and length(meeting_url)<=1000)),
 version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check((audience='customer' and diagnostic_id is not null and partner_id is null and quoted_amount is not null and quoted_amount=5900) or (audience='partner' and partner_id is not null and quoted_amount is null)),
 check(status not in ('scheduled','completed') or (starts_at is not null and meeting_url is not null))
);
create index video_assistance_requester on public.video_assistance_sessions(requester_id,created_at desc);
create index video_assistance_diagnostic on public.video_assistance_sessions(diagnostic_id) where diagnostic_id is not null;
create index video_assistance_partner on public.video_assistance_sessions(partner_id) where partner_id is not null;
create index video_assistance_created on public.video_assistance_sessions(created_at desc);
create index video_assistance_schedule on public.video_assistance_sessions(starts_at) where status='scheduled';
create unique index video_one_active_customer on public.video_assistance_sessions(requester_id,diagnostic_id) where audience='customer' and status in ('requested','scheduled');
create unique index video_one_active_partner on public.video_assistance_sessions(requester_id,partner_id) where audience='partner' and status in ('requested','scheduled');
alter table public.video_assistance_sessions enable row level security;
revoke all on public.video_assistance_sessions from public,anon,authenticated;
grant select,insert,update,delete on public.video_assistance_sessions to service_role;

create function public.request_video_assistance(p_user uuid,p_audience text,p_diagnostic uuid,p_partner uuid,p_details text,p_availability text,p_email text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.video_assistance_sessions; email text;k text;
begin
 if not public.commercial_payments_paused() then raise exception 'VIDEO_PAYMENT_NOT_ENABLED';end if;
 -- Identity and recipient are supplied only by a verified server session, never request JSON.
 if p_user is null or p_email is null or length(p_email) not between 3 and 254 then raise exception 'USER_REQUIRED';end if;
 email:=p_email;
 if p_audience is null or p_audience not in ('customer','partner') then raise exception 'INVALID_AUDIENCE';end if;
 if p_details is null or length(trim(p_details)) not between 10 and 1500 or p_availability is null or length(trim(p_availability)) not between 3 and 500 then raise exception 'INVALID_VIDEO_REQUEST';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text||p_audience,5900));
 if p_audience='customer' then
  if p_partner is not null or not exists(select 1 from public.diagnostics where id=p_diagnostic and user_id=p_user and archived_at is null) then raise exception 'DIAGNOSTIC_OWNER_REQUIRED';end if;
 else
  if not exists(select 1 from public.partner_users u join public.partners p on p.id=u.partner_id where u.user_id=p_user and u.partner_id=p_partner and u.active and p.active) then raise exception 'PARTNER_REQUIRED';end if;
  if p_diagnostic is not null and not exists(select 1 from public.diagnostics where id=p_diagnostic and assigned_partner_id=p_partner and archived_at is null) then raise exception 'DIAGNOSTIC_OWNER_REQUIRED';end if;
 end if;
 select * into s from public.video_assistance_sessions where requester_id=p_user and audience=p_audience and status in ('requested','scheduled')
 and ((p_audience='customer' and diagnostic_id=p_diagnostic) or (p_audience='partner' and partner_id=p_partner)) limit 1;
 if s.id is not null then return to_jsonb(s);end if;
 insert into public.video_assistance_sessions(requester_id,requester_email,audience,diagnostic_id,partner_id,details,availability,quoted_amount,billing_mode)
 values(p_user,email,p_audience,p_diagnostic,p_partner,trim(p_details),trim(p_availability),case when p_audience='customer' then 5900 else null end,'complimentary') returning * into s;
 k:='visio-request:'||s.id;
 insert into public.notification_jobs(key,kind,payload) values(k,'visio_requested',jsonb_build_object('videoSessionId',s.id,'notificationKey',k));
 return to_jsonb(s);
end;$$;

create function public.manage_video_assistance(p_id uuid,p_actor uuid,p_version integer,p_action text,p_starts_at timestamptz default null,p_meeting_url text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.video_assistance_sessions;k text;
begin
 if not exists(select 1 from public.admin_users where user_id=p_actor and active) then raise exception 'ADMIN_REQUIRED';end if;
 select * into s from public.video_assistance_sessions where id=p_id for update;
 if s.id is null then raise exception 'VIDEO_NOT_FOUND';end if;
 if s.version<>p_version then raise exception 'VIDEO_CONFLICT';end if;
 if p_action is null or p_action not in ('schedule','complete','cancel') or s.status in ('completed','canceled') then raise exception 'VIDEO_TRANSITION_INVALID';end if;
 if p_action='schedule' then
  if p_starts_at is null or p_starts_at<=now() or p_meeting_url is null or p_meeting_url!~'^https://' then raise exception 'INVALID_VIDEO_SCHEDULE';end if;
  perform pg_advisory_xact_lock(590030);
  if exists(select 1 from public.video_assistance_sessions where id<>p_id and status='scheduled' and starts_at<p_starts_at+interval '30 minutes' and starts_at+interval '30 minutes'>p_starts_at) then raise exception 'VIDEO_SLOT_UNAVAILABLE';end if;
  update public.video_assistance_sessions set status='scheduled',starts_at=p_starts_at,meeting_url=p_meeting_url,version=version+1,updated_at=now() where id=p_id returning * into s;
 elsif p_action='complete' then
  if s.status<>'scheduled' then raise exception 'VIDEO_TRANSITION_INVALID';end if;
  update public.video_assistance_sessions set status='completed',version=version+1,updated_at=now() where id=p_id returning * into s;
 else
  update public.video_assistance_sessions set status='canceled',version=version+1,updated_at=now() where id=p_id returning * into s;
 end if;
 k:='visio-update:'||s.id||':'||s.version;
 insert into public.notification_jobs(key,kind,payload) values(k,'visio_updated',jsonb_build_object('videoSessionId',s.id,'version',s.version,'notificationKey',k));
 return to_jsonb(s);
end;$$;
revoke all on function public.request_video_assistance(uuid,text,uuid,uuid,text,text,text),public.manage_video_assistance(uuid,uuid,integer,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.request_video_assistance(uuid,text,uuid,uuid,text,text,text),public.manage_video_assistance(uuid,uuid,integer,text,timestamptz,text) to service_role;
commit;
