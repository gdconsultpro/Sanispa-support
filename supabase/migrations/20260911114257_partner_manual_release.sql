begin;
alter table public.diagnostics add column partner_released_at timestamptz;
alter table public.diagnostics add column partner_released_by uuid;

-- No backfill: legacy attribution and purchases remain intact; approval is never invented.
create function public.release_partner_intervention(p_diagnostic uuid, p_partner uuid, p_actor uuid, p_job jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.diagnostics; recipient public.partners;
begin
  perform 1 from public.admin_users where user_id=p_actor and active;
  if not found then raise exception 'ADMIN_REQUIRED'; end if;
  select * into d from public.diagnostics where id=p_diagnostic for update;
  if d.id is null or d.choice<>'intervention' or d.request_type<>'TECHNICAL_REQUEST' or d.archived_at is not null then raise exception 'RELEASE_UNAVAILABLE'; end if;
  if d.partner_released_at is not null then
    if d.matched_partner_ids=array[p_partner] then return jsonb_build_object('released',true,'alreadyReleased',true); end if;
    raise exception 'ALREADY_RELEASED';
  end if;
  if d.assigned_partner_id is not null or exists(select 1 from public.lead_purchases where request_id=d.id and status in ('pending','paid','granted')) then raise exception 'ACQUISITION_STARTED'; end if;
  select p.* into recipient from public.partners p join public.partner_departments pd on pd.partner_id=p.id
    where p.id=p_partner and p.active and pd.department=d.department for share of p;
  if recipient.id is null then raise exception 'PARTNER_INELIGIBLE'; end if;
  if p_job->>'diagnosticId' is distinct from d.id::text or jsonb_array_length(p_job->'partners')<>1
    or p_job->'partners'->0->>'id' is distinct from p_partner::text
    or p_job->'partners'->0->>'email' is distinct from recipient.email then raise exception 'INVALID_RELEASE_NOTIFICATION'; end if;
  update public.diagnostics set matched_partner_ids=array[p_partner],partner_released_at=now(),partner_released_by=p_actor,
    status='AVAILABLE' where id=d.id;
  insert into public.diagnostic_activity(diagnostic_id,actor,status,event_type,old_status,metadata)
    values(d.id,p_actor::text,'AVAILABLE','partner_released',d.status,jsonb_build_object('partner_id',p_partner,'company_name',recipient.company_name));
  insert into public.notification_jobs(key,kind,payload) values(d.id||':manual-partner:'||p_partner,'partner',p_job) on conflict(key) do nothing;
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
  if dossier.choice='intervention' and (dossier.partner_released_at is null or dossier.matched_partner_ids<>array[p_partner]) then
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
commit;
