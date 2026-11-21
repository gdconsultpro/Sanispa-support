create function public.book_partner_tour_visit(
  p_partner uuid, p_actor uuid, p_source text, p_id uuid, p_expected timestamptz,
  p_start timestamptz, p_end timestamptz, p_technician uuid
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  pending public.partner_private_visits;
begin
  if not exists (
    select 1 from public.partner_users u join public.partners p on p.id = u.partner_id
    where u.partner_id = p_partner and u.user_id = p_actor and u.active and p.active and p.verification_status <> 'pending'
  ) then
    raise exception 'ASSIGNED_PARTNER_REQUIRED';
  end if;
  if p_technician is null or not exists (
    select 1 from public.partner_planning_technicians where partner_id = p_partner and id = p_technician
  ) then
    raise exception 'TECHNICIAN_NOT_FOUND';
  end if;
  if p_start is null or not isfinite(p_start) or p_start < now() - interval '5 minutes' then
    raise exception 'APPOINTMENT_IN_PAST';
  end if;
  if p_end is null or not isfinite(p_end) or p_end <= p_start or p_end - p_start > interval '12 hours' then
    raise exception 'INVALID_APPOINTMENT_DURATION';
  end if;

  -- Serialize additions to the same technician's tour.
  perform pg_advisory_xact_lock(hashtextextended(p_partner::text || ':' || p_technician::text, 0));
  if p_source = 'private' then
    select * into pending from public.partner_private_visits
    where partner_id = p_partner and id = p_id for update;
    if not found then raise exception 'ASSIGNED_PARTNER_REQUIRED'; end if;
    if pending.starts_at is not null or pending.updated_at is distinct from p_expected
      or (pending.technician_id is not null and pending.technician_id <> p_technician) then
      raise exception 'APPOINTMENT_CHANGED';
    end if;
  elsif p_source = 'sanispa' then
    perform 1 from public.diagnostics
    where id = p_id and assigned_partner_id = p_partner and archived_at is null and status not in ('CLOSED','terminé')
    for update;
    if not found then raise exception 'ASSIGNED_PARTNER_REQUIRED'; end if;
    if exists (select 1 from public.partner_appointments where diagnostic_id = p_id)
      or exists (select 1 from public.intervention_reports where diagnostic_id = p_id) then
      raise exception 'APPOINTMENT_CHANGED';
    end if;
  else
    raise exception 'ASSIGNED_PARTNER_REQUIRED';
  end if;

  if exists (
    select 1 from public.partner_private_visits
    where partner_id = p_partner and technician_id = p_technician and starts_at < p_end and ends_at > p_start
  ) or exists (
    select 1 from public.partner_appointments a join public.diagnostics d on d.id = a.diagnostic_id
    where a.partner_id = p_partner and a.technician_id = p_technician and a.starts_at < p_end and a.ends_at > p_start
      and d.assigned_partner_id = p_partner and d.archived_at is null
  ) then
    raise exception 'TECHNICIAN_SLOT_OCCUPIED';
  end if;

  if p_source = 'private' then
    update public.partner_private_visits
    set starts_at = p_start, ends_at = p_end, technician_id = p_technician, updated_at = clock_timestamp()
    where partner_id = p_partner and id = p_id;
  else
    perform public.save_partner_appointment(p_id, p_partner, p_actor, p_start, p_end);
    update public.partner_appointments set technician_id = p_technician
    where partner_id = p_partner and diagnostic_id = p_id;
  end if;
end;
$$;

revoke all on function public.book_partner_tour_visit(uuid,uuid,text,uuid,timestamptz,timestamptz,timestamptz,uuid) from public, anon, authenticated;
grant execute on function public.book_partner_tour_visit(uuid,uuid,text,uuid,timestamptz,timestamptz,timestamptz,uuid) to service_role;
