begin;
-- Additive: never infer a decision for existing records or alter acquisitions.
alter table public.diagnostics add column partner_kept_at timestamptz,
  add column partner_kept_by uuid,
  add constraint diagnostics_partner_dispatch_exclusive check (partner_kept_at is null or partner_released_at is null),
  add constraint diagnostics_partner_keep_actor check ((partner_kept_at is null) = (partner_kept_by is null));
create index diagnostics_partner_pending_idx on public.diagnostics(created_at desc)
  where choice='intervention' and request_type='TECHNICAL_REQUEST' and archived_at is null
  and assigned_partner_id is null and partner_released_at is null and partner_kept_at is null;

create function public.keep_partner_intervention(p_diagnostic uuid,p_actor uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.diagnostics;
begin
  perform 1 from public.admin_users where user_id=p_actor and active;
  if not found then raise exception 'ADMIN_REQUIRED'; end if;
  select * into d from public.diagnostics where id=p_diagnostic for update;
  if d.id is null or d.choice is distinct from 'intervention' or d.request_type is distinct from 'TECHNICAL_REQUEST'
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
revoke all on function public.keep_partner_intervention(uuid,uuid) from public,anon,authenticated;
grant execute on function public.keep_partner_intervention(uuid,uuid) to service_role;

create or replace function public.release_partner_intervention(p_diagnostic uuid, p_partner uuid, p_actor uuid, p_job jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.diagnostics; recipient public.partners;
begin
  perform 1 from public.admin_users where user_id=p_actor and active;
  if not found then raise exception 'ADMIN_REQUIRED'; end if;
  select * into d from public.diagnostics where id=p_diagnostic for update;
  if d.id is null or d.choice is distinct from 'intervention' or d.request_type is distinct from 'TECHNICAL_REQUEST' or d.archived_at is not null then raise exception 'RELEASE_UNAVAILABLE'; end if;
  if d.partner_kept_at is not null then raise exception 'KEPT_BY_SANISPA'; end if;
  if d.partner_released_at is not null then
    if d.matched_partner_ids=array[p_partner] then return jsonb_build_object('released',true,'alreadyReleased',true); end if;
    raise exception 'ALREADY_RELEASED';
  end if;
  if d.status not in ('NEW','AVAILABLE','nouvelle') then raise exception 'RELEASE_UNAVAILABLE'; end if;
  if d.assigned_partner_id is not null or exists(select 1 from public.lead_purchases where request_id=d.id and status in ('pending','paid','granted')) then raise exception 'ACQUISITION_STARTED'; end if;
  select p.* into recipient from public.partners p join public.partner_departments pd on pd.partner_id=p.id
    where p.id=p_partner and p.active and pd.department=d.department for share of p;
  if recipient.id is null then raise exception 'PARTNER_INELIGIBLE'; end if;
  if p_job->>'diagnosticId' is distinct from d.id::text or jsonb_array_length(p_job->'partners')<>1
    or p_job->'partners'->0->>'id' is distinct from p_partner::text
    or p_job->'partners'->0->>'email' is distinct from recipient.email then raise exception 'INVALID_RELEASE_NOTIFICATION'; end if;
  update public.diagnostics set matched_partner_ids=array[p_partner],partner_released_at=now(),partner_released_by=p_actor where id=d.id;
  insert into public.diagnostic_activity(diagnostic_id,actor,status,event_type,old_status,metadata)
    values(d.id,p_actor::text,d.status,'partner_released',d.status,jsonb_build_object('decision','released','partner_id',p_partner,'company_name',recipient.company_name));
  insert into public.notification_jobs(key,kind,payload) values(d.id||':manual-partner:'||p_partner,'partner',p_job || jsonb_build_object('notificationKey',d.id||':manual-partner:'||p_partner)) on conflict(key) do nothing;
  return jsonb_build_object('released',true,'alreadyReleased',false);
end;
$$;
revoke all on function public.release_partner_intervention(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.release_partner_intervention(uuid,uuid,uuid,jsonb) to service_role;

create or replace function public.prepare_partner_acquisition(
  p_diagnostic uuid, p_partner uuid, p_actor uuid,
  p_price_id text default null, p_amount integer default null, p_currency text default 'eur'
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  dossier public.diagnostics;
  partner public.partners;
  purchase public.lead_purchases;
  reservation_until timestamptz;
begin
  -- All acquisition, checkout and payment transitions lock the dossier first.
  select * into dossier from public.diagnostics where id = p_diagnostic for update;
  if dossier.id is null then raise exception 'LEAD_NOT_FOUND'; end if;
  select * into partner from public.partners where id = p_partner for share;
  if partner.id is null or not partner.active then raise exception 'PARTNER_REQUIRED'; end if;
  perform 1 from public.partner_users
    where partner_id = p_partner and user_id = p_actor and active is true for share;
  if not found then raise exception 'PARTNER_REQUIRED'; end if;

  if dossier.assigned_partner_id is not null then
    if dossier.assigned_partner_id <> p_partner then raise exception 'LEAD_UNAVAILABLE'; end if;
    select * into purchase from public.lead_purchases
      where request_id = p_diagnostic and partner_id = p_partner and status in ('paid', 'granted')
      order by purchased_at desc, id desc limit 1 for update;
    -- An existing manual/legacy assignment need not have a fabricated purchase.
    return jsonb_build_object('kind', 'assigned', 'purchase', to_jsonb(purchase), 'resumed', true);
  end if;

  if dossier.archived_at is not null or dossier.request_type is distinct from 'TECHNICAL_REQUEST'
    or dossier.status not in ('NEW', 'AVAILABLE', 'nouvelle')
    or not coalesce(p_partner = any(dossier.matched_partner_ids), false) then
    raise exception 'LEAD_UNAVAILABLE';
  end if;
  if exists (select 1 from public.lead_purchases
    where request_id = p_diagnostic and status in ('paid', 'granted')) then
    raise exception 'LEAD_UNAVAILABLE';
  end if;

  -- A local timeout is not proof that Stripe can no longer accept the payment.
  -- Preserve any pending attempt, even after its former local lock has expired.
  if exists (select 1 from public.lead_purchases
    where request_id = p_diagnostic and status = 'pending' and partner_id <> p_partner) then
    raise exception 'LEAD_RESERVED';
  end if;
  select * into purchase from public.lead_purchases
    where request_id = p_diagnostic and partner_id = p_partner and status = 'pending'
    order by purchased_at, id limit 1 for update;
  if purchase.id is not null then
    if not purchase.payment_required then raise exception 'LEAD_UNAVAILABLE'; end if;
    return jsonb_build_object('kind', 'checkout', 'purchase', to_jsonb(purchase), 'resumed', true);
  end if;
  -- Existing reservations above retain their original conditions.
  if dossier.choice='intervention' and (dossier.partner_kept_at is not null or dossier.partner_released_at is null or dossier.matched_partner_ids<>array[p_partner]) then
    raise exception 'LEAD_UNAVAILABLE';
  end if;
  if dossier.lead_locked_until > now() then raise exception 'LEAD_RESERVED'; end if;

  if partner.leads_paid then
    if p_price_id is null or btrim(p_price_id) = '' or char_length(p_price_id) > 255
      or p_amount is null or p_amount <= 0 or p_currency is null or p_currency !~ '^[a-z]{3}$' then
      raise exception 'BILLING_TERMS_CHANGED';
    end if;
    reservation_until := now() + interval '15 minutes';
    insert into public.lead_purchases
      (request_id, partner_id, status, payment_required, amount, currency, stripe_price_id, locked_until)
      values (p_diagnostic, p_partner, 'pending', true, p_amount, p_currency, p_price_id, reservation_until)
      returning * into purchase;
    update public.diagnostics set lead_locked_until = reservation_until where id = p_diagnostic;
    return jsonb_build_object('kind', 'checkout', 'purchase', to_jsonb(purchase), 'resumed', false);
  end if;

  insert into public.lead_purchases
    (request_id, partner_id, status, payment_required, amount, currency)
    values (p_diagnostic, p_partner, 'granted', false, 0, 'eur') returning * into purchase;
  update public.diagnostics set assigned_partner_id = p_partner, assigned_at = now(),
    status = 'ASSIGNED', lead_locked_until = null where id = p_diagnostic;
  insert into public.diagnostic_activity (diagnostic_id, actor, status, event_type, old_status, metadata)
    values (p_diagnostic, p_actor::text, 'ASSIGNED', 'partner_assigned', dossier.status,
      jsonb_build_object('partner_id', p_partner, 'payment_required', false, 'purchase_id', purchase.id));
  return jsonb_build_object('kind', 'assigned', 'purchase', to_jsonb(purchase), 'resumed', false);
end;
$$;

-- Defense in depth at submission: proposals cannot become authorizations.
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
 p_department,case when p->>'choice'='intervention' then '{}'::uuid[] else p_partners end,case when water then 'WATER_ANALYSIS' else 'AVAILABLE' end,p->>'choice',case when water then 'water' else null end,'pending');
 for x in select value from jsonb_array_elements(p_answers) loop
 insert into diagnostic_answers(diagnostic_id,question_key,question_label,answer) values(d.id,x->>'question_key',x->>'question_label',x->>'answer'); end loop;
 for x in select value from jsonb_array_elements(p_photos) loop
 insert into diagnostic_photos(diagnostic_id,photo_type,storage_path,public_url) values(d.id,x->>'photo_type',x->>'storage_path',null); end loop;
 for x in select value from jsonb_array_elements(p_jobs) loop
 if not (p->>'choice'='intervention' and x->>'kind'='partner') then
 insert into notification_jobs(key,kind,payload) values(x->>'key',x->>'kind',x->'payload') on conflict(key) do nothing;
 end if; end loop;
 update diagnostic_drafts set submitted_at=now(),payload=payload-'photos',updated_at=now() where id=d.id;
 return d.id;
end; $$;

-- A stable delivery window prevents retrying an uncertain send after provider deduplication expires.
alter table public.notification_jobs add column first_delivery_attempt_at timestamptz;
create or replace function public.claim_notifications(p_key text default null) returns setof public.notification_jobs
language sql security invoker set search_path='' as $$
 update public.notification_jobs set locked_until=now()+interval '2 minutes',attempts=attempts+1,
 first_delivery_attempt_at=case when kind='partner' then coalesce(first_delivery_attempt_at,case when attempts>0 then created_at else now() end) else first_delivery_attempt_at end
 where id in (select id from public.notification_jobs where state='pending' and (locked_until is null or locked_until<now())
 and (p_key is null or key like p_key||'%') order by created_at limit 10 for update skip locked) returning *;
$$;
revoke all on function public.claim_notifications(text) from public,anon,authenticated;
grant execute on function public.claim_notifications(text) to service_role;
commit;
