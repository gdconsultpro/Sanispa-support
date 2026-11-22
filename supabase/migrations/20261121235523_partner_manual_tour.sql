create function public.apply_partner_tour(
  p_partner uuid, p_actor uuid, p_technician uuid, p_day date, p_stops jsonb
) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  day_start timestamptz;
  day_end timestamptz;
  tour_now timestamptz;
  requested record;
  booking record;
  dossier_status text;
  proposed_end timestamptz;
  previous_start timestamptz;
  proposed jsonb := '[]'::jsonb;
  applied integer := 0;
begin
  if not exists (
    select 1 from public.partner_users u join public.partners p on p.id = u.partner_id
    where u.partner_id = p_partner and u.user_id = p_actor and u.active and p.active and p.verification_status <> 'pending'
  ) then raise exception 'ASSIGNED_PARTNER_REQUIRED'; end if;
  if not exists (
    select 1 from public.partner_planning_technicians where partner_id = p_partner and id = p_technician
  ) then raise exception 'TECHNICIAN_NOT_FOUND'; end if;

  if p_day is null or p_day < date '1900-01-01' or p_day > date '2099-12-31'
    or jsonb_typeof(p_stops) is distinct from 'array' then raise exception 'INVALID_TOUR'; end if;
  if jsonb_array_length(p_stops) not between 1 and 100 or exists (
    select 1 from jsonb_to_recordset(p_stops) as stop(source text, id uuid)
    group by stop.source, stop.id having count(*) > 1
  ) then raise exception 'INVALID_TOUR'; end if;

  day_start := p_day::timestamp at time zone 'Europe/Paris';
  day_end := (p_day + 1)::timestamp at time zone 'Europe/Paris';
  perform pg_advisory_xact_lock(hashtextextended(p_partner::text || ':' || p_technician::text, 0));
  tour_now := clock_timestamp();

  for requested in
    select item.source, item.id, item.expected_at, item.starts_at
    from jsonb_array_elements(p_stops) with ordinality as step(value, position)
    cross join lateral jsonb_to_record(step.value) as item(source text, id uuid, expected_at timestamptz, starts_at timestamptz)
    order by step.position
  loop
    if requested.id is null or requested.expected_at is null or requested.starts_at is null
      or requested.starts_at < day_start or requested.starts_at >= day_end
      or requested.starts_at < previous_start then raise exception 'INVALID_TOUR'; end if;
    previous_start := requested.starts_at;

    if requested.source = 'private' then
      dossier_status := null;
      select starts_at, ends_at, updated_at into booking from public.partner_private_visits
      where partner_id = p_partner and technician_id = p_technician and id = requested.id for update;
    elsif requested.source = 'sanispa' then
      -- Match the lock order of existing scheduling and cancellation.
      select d.status into dossier_status from public.diagnostics d
      where d.id = requested.id and d.assigned_partner_id = p_partner and d.archived_at is null for update;
      if not found then raise exception 'TOUR_CHANGED'; end if;
      select starts_at, ends_at, updated_at into booking from public.partner_appointments
      where partner_id = p_partner and technician_id = p_technician and diagnostic_id = requested.id for update;
    else
      raise exception 'INVALID_TOUR';
    end if;

    if not found or booking.starts_at is null or booking.starts_at < day_start or booking.starts_at >= day_end
      or booking.updated_at is distinct from requested.expected_at then raise exception 'TOUR_CHANGED'; end if;
    if booking.starts_at <> requested.starts_at and (
      booking.starts_at <= tour_now or requested.starts_at <= tour_now or dossier_status in ('CLOSED','terminé')
    ) then raise exception 'TOUR_STOP_LOCKED'; end if;

    proposed_end := requested.starts_at + (booking.ends_at - booking.starts_at);
    proposed := proposed || jsonb_build_object(
      'source', requested.source, 'id', requested.id, 'starts_at', requested.starts_at, 'ends_at', proposed_end,
      'changed', booking.starts_at <> requested.starts_at
    );
  end loop;

  -- Reject a proposal built before a new appointment appeared on this day.
  if jsonb_array_length(proposed) <> (
    select count(*) from (
      select id from public.partner_private_visits
      where partner_id = p_partner and technician_id = p_technician and starts_at >= day_start and starts_at < day_end
      union all
      select a.diagnostic_id from public.partner_appointments a join public.diagnostics d on d.id = a.diagnostic_id
      where a.partner_id = p_partner and a.technician_id = p_technician and a.starts_at >= day_start and a.starts_at < day_end
        and d.assigned_partner_id = p_partner and d.archived_at is null
    ) as current_day
  ) then raise exception 'TOUR_CHANGED'; end if;

  for requested in
    select * from jsonb_to_recordset(proposed) as step(source text, id uuid, starts_at timestamptz, ends_at timestamptz, changed boolean)
    where step.changed
  loop
    if exists (
      select 1 from jsonb_to_recordset(proposed) as other(source text, id uuid, starts_at timestamptz, ends_at timestamptz)
      where (other.source, other.id) <> (requested.source, requested.id)
        and other.starts_at < requested.ends_at and other.ends_at > requested.starts_at
    ) or exists (
      select 1 from public.partner_private_visits
      where partner_id = p_partner and technician_id = p_technician
        and (starts_at < day_start or starts_at >= day_end) and starts_at < requested.ends_at and ends_at > requested.starts_at
    ) or exists (
      select 1 from public.partner_appointments a join public.diagnostics d on d.id = a.diagnostic_id
      where a.partner_id = p_partner and a.technician_id = p_technician
        and (a.starts_at < day_start or a.starts_at >= day_end) and a.starts_at < requested.ends_at and a.ends_at > requested.starts_at
        and d.assigned_partner_id = p_partner and d.archived_at is null
    ) then raise exception 'TOUR_OVERLAP'; end if;

    if requested.source = 'private' then
      update public.partner_private_visits
      set starts_at = requested.starts_at, ends_at = requested.ends_at, updated_at = clock_timestamp()
      where partner_id = p_partner and technician_id = p_technician and id = requested.id;
    else
      perform public.save_partner_appointment(requested.id, p_partner, p_actor, requested.starts_at, requested.ends_at);
    end if;
    applied := applied + 1;
  end loop;

  return applied;
end;
$$;

revoke all on function public.apply_partner_tour(uuid,uuid,uuid,date,jsonb) from public, anon, authenticated;
grant execute on function public.apply_partner_tour(uuid,uuid,uuid,date,jsonb) to service_role;
