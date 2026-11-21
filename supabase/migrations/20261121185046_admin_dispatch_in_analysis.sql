begin;

-- A completed analysis can lead to a manual offer. All existing dispatch, charter and assignment checks still apply.

create or replace function public.publish_partner_offer(p_diagnostic uuid,p_partner uuid,p_actor uuid,p_category text,p_description text,p_photos text[])
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.diagnostics; p public.partners; amount int; k text;
begin
 perform 1 from public.admin_users where user_id=p_actor and active;
 if not found then raise exception 'ADMIN_REQUIRED'; end if;
 select * into d from public.diagnostics where id=p_diagnostic for update;
 if d.id is null or d.request_type<>'TECHNICAL_REQUEST' or d.archived_at is not null
 or d.status not in ('NEW','AVAILABLE','nouvelle','en analyse') or d.partner_kept_at is not null
 or d.partner_released_at is not null or d.assigned_partner_id is not null
 or exists(select 1 from public.lead_purchases where request_id=d.id and status in ('pending','paid','granted')) then raise exception 'RELEASE_UNAVAILABLE';end if;
 select x.* into p from public.partners x join public.partner_departments pd on pd.partner_id=x.id
 where x.id=p_partner and x.active and pd.department=d.department for share of x;
 if p.id is null then raise exception 'PARTNER_INELIGIBLE';end if;
 if p.verification_status='pending' then raise exception 'PARTNER_VERIFICATION_REQUIRED';end if;
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

create or replace function private.acquire_partner_offer(p_diagnostic uuid,p_partner uuid,p_actor uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare d public.diagnostics;p public.partners;s public.partner_subscriptions;b public.lead_purchases;k text;
begin
 select * into d from public.diagnostics where id=p_diagnostic for update;
 select * into p from public.partners where id=p_partner and active for share;
 perform 1 from public.partner_users where partner_id=p_partner and user_id=p_actor and active for share;
 if not found or p.id is null then raise exception 'PARTNER_REQUIRED';end if;
 if d.assigned_partner_id=p_partner then return jsonb_build_object('kind','assigned');end if;
 if d.id is null or d.offer_version<>2 or d.assigned_partner_id is not null or d.archived_at is not null
 or d.request_type<>'TECHNICAL_REQUEST' or d.status not in ('NEW','AVAILABLE','nouvelle','en analyse')
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

create or replace function public.acquire_partner_offer(p_diagnostic uuid,p_partner uuid,p_actor uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.diagnostics;p public.partners;k text;
begin
 if not public.commercial_payments_paused() then return private.acquire_partner_offer(p_diagnostic,p_partner,p_actor);end if;
 select * into d from public.diagnostics where id=p_diagnostic for update;
 select * into p from public.partners where id=p_partner and active for share;
 perform 1 from public.partner_users where partner_id=p_partner and user_id=p_actor and active for share;
 if not found or p.id is null then raise exception 'PARTNER_REQUIRED';end if;
 if d.assigned_partner_id=p_partner then return jsonb_build_object('kind','assigned');end if;
 if d.id is null or d.offer_version<>2 or d.assigned_partner_id is not null or d.archived_at is not null
 or d.request_type<>'TECHNICAL_REQUEST' or d.status not in ('NEW','AVAILABLE','nouvelle','en analyse')
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

create or replace function public.decline_partner_offer(p_diagnostic uuid, p_partner uuid, p_actor uuid, p_offered_at timestamptz)
returns text
language plpgsql security invoker set search_path='' as $$
declare
  dossier public.diagnostics;
  company text;
  job_key text := 'partner-declined:' || p_diagnostic || ':' || p_partner || ':' || extract(epoch from p_offered_at)::text;
begin
  select * into dossier from public.diagnostics where id=p_diagnostic for update;
  select p.company_name into company from public.partner_users u
    join public.partners p on p.id=u.partner_id
    where u.user_id=p_actor and u.partner_id=p_partner and u.active and p.active
    for share of u,p;
  if company is null or dossier.id is null or dossier.archived_at is not null then
    raise exception 'OFFER_UNAVAILABLE';
  end if;
  if exists(select 1 from public.notification_jobs where key=job_key) then return job_key; end if;
  if not public.commercial_payments_paused()
     or p_offered_at is null or dossier.partner_released_at is distinct from p_offered_at
     or dossier.request_type <> 'TECHNICAL_REQUEST' or dossier.offer_version <> 2
     or dossier.status not in ('NEW','AVAILABLE','nouvelle','en analyse')
     or dossier.partner_kept_at is not null or dossier.assigned_partner_id is not null
     or dossier.matched_partner_ids is distinct from array[p_partner]
     or exists(select 1 from public.lead_purchases where request_id=dossier.id and status in ('pending','paid','granted')) then
    raise exception 'OFFER_UNAVAILABLE';
  end if;

  update public.diagnostics set
    partner_released_at=null, partner_released_by=null, matched_partner_ids='{}',
    preview_description=null, preview_photo_paths='{}', lead_locked_until=null
  where id=dossier.id;

  update public.notification_jobs
    set key=key || ':declined:' || id::text,
        state=case when state='pending' then 'cancelled' else state end,
        locked_until=null
    where key=dossier.id || ':manual-partner:' || p_partner;

  insert into public.diagnostic_activity(diagnostic_id,actor,status,event_type,metadata)
    values(dossier.id,p_actor::text,dossier.status,'partner_declined',jsonb_build_object('partner_id',p_partner,'company_name',company));
  insert into public.notification_jobs(key,kind,payload)
    values(job_key,'partner_declined',jsonb_build_object('diagnosticId',dossier.id,'partnerName',company,'notificationKey',job_key));
  return job_key;
end;$$;

commit;
