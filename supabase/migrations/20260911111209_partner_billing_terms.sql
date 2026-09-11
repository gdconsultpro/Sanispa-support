begin;

-- Keep existing partners and attempts on their previous paid-lead terms.
alter table public.partners add column leads_paid boolean not null default true;
alter table public.lead_purchases add column payment_required boolean not null default true;
alter table public.lead_purchases add column stripe_price_id text;
alter table public.lead_purchases add column currency text not null default 'eur';

create table public.partner_lead_terms_history (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  created_at timestamptz not null default now(),
  actor uuid not null,
  old_leads_paid boolean not null,
  new_leads_paid boolean not null,
  check (old_leads_paid is distinct from new_leads_paid)
);
create index partner_lead_terms_history_partner_created_idx
  on public.partner_lead_terms_history (partner_id, created_at desc, id desc);
alter table public.partner_lead_terms_history enable row level security;
revoke all on public.partner_lead_terms_history from public, anon, authenticated;
grant select, insert on public.partner_lead_terms_history to service_role;

-- Each retry receives a new id; a completed/expired attempt is never overwritten.
alter table public.lead_purchases drop constraint if exists lead_purchases_request_id_partner_id_key;
-- Keep the historical paid-only index as well as covering free acquisitions.
create unique index lead_purchases_one_acquisition_per_request_idx
  on public.lead_purchases (request_id) where status in ('paid', 'granted');

create function public.set_partner_leads_paid(p_partner uuid, p_value boolean, p_actor uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  partner public.partners;
  previous_value boolean;
begin
  if p_value is null then raise exception 'INVALID_BILLING_SETTING'; end if;
  perform 1 from public.admin_users where user_id = p_actor and active;
  if not found then raise exception 'ADMIN_REQUIRED'; end if;
  select * into partner from public.partners where id = p_partner for update;
  if partner.id is null then raise exception 'PARTNER_NOT_FOUND'; end if;
  previous_value := partner.leads_paid;
  if previous_value is distinct from p_value then
    update public.partners set leads_paid = p_value where id = p_partner returning * into partner;
    insert into public.partner_lead_terms_history (partner_id, actor, old_leads_paid, new_leads_paid)
      values (p_partner, p_actor, previous_value, p_value);
  end if;
  return to_jsonb(partner);
end;
$$;

create function public.prepare_partner_acquisition(
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

create function public.attach_partner_checkout(
  p_purchase uuid, p_partner uuid, p_diagnostic uuid, p_session text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  dossier public.diagnostics;
  purchase public.lead_purchases;
begin
  select * into dossier from public.diagnostics where id = p_diagnostic for update;
  select * into purchase from public.lead_purchases
    where id = p_purchase and request_id = p_diagnostic and partner_id = p_partner for update;
  if dossier.id is null or purchase.id is null then raise exception 'LEAD_NOT_FOUND'; end if;
  if p_session is null or btrim(p_session) = '' then raise exception 'SESSION_MISMATCH'; end if;
  if not purchase.payment_required or purchase.status is distinct from 'pending'
    or dossier.assigned_partner_id is not null then raise exception 'LEAD_UNAVAILABLE'; end if;
  if purchase.stripe_checkout_session_id is not null and purchase.stripe_checkout_session_id <> p_session then
    raise exception 'SESSION_MISMATCH';
  end if;
  update public.lead_purchases set stripe_checkout_session_id = p_session
    where id = p_purchase returning * into purchase;
  return to_jsonb(purchase);
end;
$$;

create function public.finish_partner_checkout(
  p_purchase uuid, p_partner uuid, p_diagnostic uuid, p_session text, p_status text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  dossier public.diagnostics;
  purchase public.lead_purchases;
  previous_lock timestamptz;
begin
  if p_status is null or p_status not in ('expired', 'failed') then raise exception 'INVALID_CHECKOUT_STATUS'; end if;
  select * into dossier from public.diagnostics where id = p_diagnostic for update;
  select * into purchase from public.lead_purchases
    where id = p_purchase and request_id = p_diagnostic and partner_id = p_partner for update;
  if dossier.id is null or purchase.id is null then raise exception 'LEAD_NOT_FOUND'; end if;
  -- No automatic release of an unknown checkout whose creation may have succeeded.
  if p_session is null or btrim(p_session) = '' or purchase.stripe_checkout_session_id is distinct from p_session then
    raise exception 'SESSION_MISMATCH';
  end if;
  if not purchase.payment_required then raise exception 'LEAD_UNAVAILABLE'; end if;
  if purchase.status is distinct from 'pending' then return to_jsonb(purchase); end if;
  previous_lock := purchase.locked_until;
  update public.lead_purchases set status = p_status, locked_until = null
    where id = p_purchase returning * into purchase;
  update public.diagnostics set lead_locked_until = null
    where id = p_diagnostic and assigned_partner_id is null
      and lead_locked_until is not distinct from previous_lock
      and not exists (select 1 from public.lead_purchases where request_id = p_diagnostic and status = 'pending');
  return to_jsonb(purchase);
end;
$$;

create or replace function public.apply_partner_payment(
  p_session text, p_purchase uuid, p_partner uuid, p_diagnostic uuid, p_intent text, p_paid_at timestamptz
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  dossier public.diagnostics;
  purchase public.lead_purchases;
begin
  select * into dossier from public.diagnostics where id = p_diagnostic for update;
  select * into purchase from public.lead_purchases
    where id = p_purchase and partner_id = p_partner and request_id = p_diagnostic for update;
  if dossier.id is null or purchase.id is null
    or (dossier.assigned_partner_id is not null and dossier.assigned_partner_id <> p_partner) then
    raise exception 'PARTNER_ASSIGNMENT_CONFLICT';
  end if;
  if not purchase.payment_required then raise exception 'PAYMENT_NOT_REQUIRED'; end if;
  if p_session is null or btrim(p_session) = '' or purchase.stripe_checkout_session_id is distinct from p_session then
    raise exception 'SESSION_MISMATCH';
  end if;
  if purchase.status = 'paid' then return; end if;
  if purchase.status is distinct from 'pending' then raise exception 'PURCHASE_NOT_PENDING'; end if;
  update public.lead_purchases set status = 'paid', stripe_payment_intent_id = p_intent,
    paid_at = p_paid_at, locked_until = null where id = p_purchase;
  update public.diagnostics set assigned_partner_id = p_partner, assigned_at = p_paid_at,
    lead_locked_until = null, status = 'ASSIGNED' where id = p_diagnostic;
end;
$$;

grant select, update on public.partners, public.diagnostics to service_role;
grant select on public.admin_users to service_role;
grant select, update on public.partner_users to service_role;
grant select, insert, update on public.lead_purchases to service_role;
grant insert on public.diagnostic_activity to service_role;
revoke all on function public.set_partner_leads_paid(uuid,boolean,uuid) from public, anon, authenticated;
revoke all on function public.prepare_partner_acquisition(uuid,uuid,uuid,text,integer,text) from public, anon, authenticated;
revoke all on function public.attach_partner_checkout(uuid,uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.finish_partner_checkout(uuid,uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.apply_partner_payment(text,uuid,uuid,uuid,text,timestamptz) from public, anon, authenticated;
grant execute on function public.set_partner_leads_paid(uuid,boolean,uuid) to service_role;
grant execute on function public.prepare_partner_acquisition(uuid,uuid,uuid,text,integer,text) to service_role;
grant execute on function public.attach_partner_checkout(uuid,uuid,uuid,text) to service_role;
grant execute on function public.finish_partner_checkout(uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.apply_partner_payment(text,uuid,uuid,uuid,text,timestamptz) to service_role;

commit;
