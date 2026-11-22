create function public.apply_partner_tour_and_queue(
  p_partner uuid, p_actor uuid, p_technician uuid, p_day date, p_stops jsonb, p_batch uuid
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  changed_steps jsonb;
  updated integer;
  queued integer;
begin
  if p_batch is null or jsonb_typeof(p_stops) is distinct from 'array' then
    raise exception 'INVALID_TOUR';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_partner::text || ':' || p_technician::text, 0));

  -- Snapshot changed steps before the scheduling function validates and locks the same versions.
  select coalesce(jsonb_agg(jsonb_build_object('source', step.source, 'id', step.id)), '[]'::jsonb)
  into changed_steps
  from jsonb_to_recordset(p_stops) as step(source text, id uuid, expected_at timestamptz, starts_at timestamptz)
  where (
    step.source = 'private' and exists (
      select 1 from public.partner_private_visits v where v.partner_id = p_partner and v.technician_id = p_technician
      and v.id = step.id and v.updated_at = step.expected_at and v.starts_at <> step.starts_at
    )
  ) or (
    step.source = 'sanispa' and exists (
      select 1 from public.partner_appointments a where a.partner_id = p_partner and a.technician_id = p_technician
      and a.diagnostic_id = step.id and a.updated_at = step.expected_at and a.starts_at <> step.starts_at
    )
  );

  updated := public.apply_partner_tour(p_partner, p_actor, p_technician, p_day, p_stops);

  with changed as (
    select * from jsonb_to_recordset(changed_steps) as step(source text, id uuid)
  ), appointments as (
    select 'private' source, v.id, v.starts_at, v.ends_at, v.updated_at
    from changed s
    join public.partner_private_visits v on s.source = 'private' and v.id = s.id and v.partner_id = p_partner
    join public.partner_private_clients c on c.id = v.client_id and c.partner_id = v.partner_id
    where btrim(c.email) ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    union all
    select 'sanispa' source, a.diagnostic_id, a.starts_at, a.ends_at, a.updated_at
    from changed s
    join public.partner_appointments a on s.source = 'sanispa' and a.diagnostic_id = s.id and a.partner_id = p_partner
    join public.diagnostics d on d.id = a.diagnostic_id and d.assigned_partner_id = p_partner and d.archived_at is null
    join public.customers c on c.id = d.customer_id
    where d.user_id is not null or btrim(c.email) ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  )
  insert into public.notification_jobs(key, kind, payload)
  select 'tour-slot:' || p_batch || ':' || a.source || ':' || a.id, 'tour_slot_changed',
    jsonb_build_object('source', a.source, 'appointmentId', a.id, 'partnerId', p_partner,
      'startsAt', a.starts_at, 'endsAt', a.ends_at, 'version', a.updated_at)
  from appointments a;
  get diagnostics queued = row_count;
  return jsonb_build_object('updated', updated, 'queued', queued, 'without_email', updated - queued);
end;
$$;

revoke all on function public.apply_partner_tour_and_queue(uuid,uuid,uuid,date,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.apply_partner_tour_and_queue(uuid,uuid,uuid,date,jsonb,uuid) to service_role;

create or replace function public.claim_notifications(p_key text default null)
returns setof public.notification_jobs
language sql security invoker set search_path = '' as $$
  update public.notification_jobs set locked_until=now()+interval '2 minutes',attempts=attempts+1,
  first_delivery_attempt_at=case when kind in ('partner','partner_accepted','partner_declined','client_report','client_review_reminder','premium_care','tour_slot_changed')
    then coalesce(first_delivery_attempt_at,case when attempts>0 then created_at else now() end) else first_delivery_attempt_at end
  where id in (select id from public.notification_jobs where state='pending' and (locked_until is null or locked_until<now())
    and (p_key is null or key like p_key||'%') order by created_at limit 10 for update skip locked) returning *;
$$;
