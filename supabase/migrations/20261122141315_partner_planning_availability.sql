create table public.partner_intervention_durations (
  partner_id uuid not null references public.partners(id) on delete cascade,
  type_key text not null check (length(type_key) between 1 and 140),
  label text not null check (length(btrim(label)) between 1 and 140),
  duration_minutes integer not null check (duration_minutes between 1 and 720),
  primary key (partner_id, type_key)
);

create table public.partner_technician_workweeks (
  partner_id uuid not null,
  technician_id uuid not null,
  hours jsonb not null check (jsonb_typeof(hours) = 'array' and jsonb_array_length(hours) <= 14),
  primary key (partner_id, technician_id),
  foreign key (partner_id, technician_id) references public.partner_planning_technicians(partner_id, id) on delete cascade
);

create table public.partner_technician_absences (
  partner_id uuid not null,
  technician_id uuid not null,
  id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  label text not null default '' check (length(label) <= 100),
  check (isfinite(starts_at) and isfinite(ends_at) and starts_at < ends_at),
  primary key (partner_id, technician_id, id),
  foreign key (partner_id, technician_id) references public.partner_planning_technicians(partner_id, id) on delete cascade
);
create index partner_technician_absences_period on public.partner_technician_absences (partner_id, technician_id, starts_at, ends_at);
create index partner_private_visits_technician_period on public.partner_private_visits (partner_id, technician_id, starts_at, ends_at) where technician_id is not null;
create index partner_appointments_technician_period on public.partner_appointments (partner_id, technician_id, starts_at, ends_at) where technician_id is not null;

alter table public.partner_intervention_durations enable row level security;
alter table public.partner_technician_workweeks enable row level security;
alter table public.partner_technician_absences enable row level security;
revoke all on public.partner_intervention_durations, public.partner_technician_workweeks, public.partner_technician_absences from public, anon, authenticated;
grant select, insert, update, delete on public.partner_intervention_durations, public.partner_technician_workweeks, public.partner_technician_absences to service_role;

create function private.lock_partner_technician_availability() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform pg_advisory_xact_lock(hashtextextended(old.partner_id::text || ':' || old.technician_id::text, 0));
    return old;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.partner_id::text || ':' || new.technician_id::text, 0));
  return new;
end;
$$;

create trigger partner_workweek_lock before insert or update or delete on public.partner_technician_workweeks
for each row execute function private.lock_partner_technician_availability();
create trigger partner_absence_lock before insert or update or delete on public.partner_technician_absences
for each row execute function private.lock_partner_technician_availability();

create function private.partner_technician_bookings(p_partner uuid, p_technician uuid, p_from timestamptz, p_to timestamptz)
returns table(source text, id uuid, starts_at timestamptz, ends_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select 'private', v.id, v.starts_at, v.ends_at
  from public.partner_private_visits v
  where v.partner_id = p_partner and v.technician_id = p_technician and v.starts_at < p_to and v.ends_at > p_from
  union all
  select 'sanispa', a.diagnostic_id, a.starts_at, a.ends_at
  from public.partner_appointments a join public.diagnostics d on d.id = a.diagnostic_id
  where a.partner_id = p_partner and a.technician_id = p_technician and a.starts_at < p_to and a.ends_at > p_from
    and d.assigned_partner_id = p_partner and d.archived_at is null;
$$;

create function private.check_partner_technician_booking() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare booking record;
declare booking_source text;
declare booking_id uuid;
declare day_start timestamp;
begin
  if tg_op = 'UPDATE' and (old.partner_id, old.technician_id, old.starts_at, old.ends_at)
    is not distinct from (new.partner_id, new.technician_id, new.starts_at, new.ends_at) then return null; end if;
  -- Re-read the final appointment after all writes, including a complete tour reorder.
  if tg_table_name = 'partner_private_visits' then
    booking_source := 'private';
    booking_id := new.id;
    select partner_id, technician_id, starts_at, ends_at into booking
    from public.partner_private_visits where partner_id = new.partner_id and id = booking_id;
  else
    booking_source := 'sanispa';
    booking_id := new.diagnostic_id;
    select a.partner_id, a.technician_id, a.starts_at, a.ends_at into booking
    from public.partner_appointments a join public.diagnostics d on d.id = a.diagnostic_id
    where a.diagnostic_id = booking_id and d.assigned_partner_id = a.partner_id and d.archived_at is null;
  end if;
  if not found or booking.technician_id is null or booking.starts_at is null or booking.ends_at is null then return null; end if;
  -- Ignore intermediate writes. A later event checks the final values.
  if (booking.partner_id, booking.technician_id, booking.starts_at, booking.ends_at)
    is distinct from (new.partner_id, new.technician_id, new.starts_at, new.ends_at) then return null; end if;

  perform pg_advisory_xact_lock(hashtextextended(booking.partner_id::text || ':' || booking.technician_id::text, 0));
  day_start := booking.starts_at at time zone 'Europe/Paris';
  if exists (
    select 1 from public.partner_technician_workweeks w
    where w.partner_id = booking.partner_id and w.technician_id = booking.technician_id
      and not exists (
        select 1 from jsonb_to_recordset(w.hours) as h(weekday integer, "start" time, "end" time)
        where h.weekday = extract(isodow from day_start)
          and booking.starts_at >= ((day_start::date + h."start") at time zone 'Europe/Paris')
          and booking.ends_at <= ((day_start::date + h."end") at time zone 'Europe/Paris')
      )
  ) then raise exception 'TECHNICIAN_OUTSIDE_HOURS'; end if;
  if exists (
    select 1 from public.partner_technician_absences b
    where b.partner_id = booking.partner_id and b.technician_id = booking.technician_id
      and b.starts_at < booking.ends_at and b.ends_at > booking.starts_at
  ) then raise exception 'TECHNICIAN_ABSENT'; end if;
  if exists (
    select 1 from private.partner_technician_bookings(booking.partner_id, booking.technician_id, booking.starts_at, booking.ends_at) b
    where (b.source, b.id) <> (booking_source, booking_id)
  ) then raise exception 'TECHNICIAN_SLOT_OCCUPIED'; end if;
  return null;
end;
$$;

create constraint trigger validate_private_visit_availability after insert or update on public.partner_private_visits
deferrable initially deferred for each row execute function private.check_partner_technician_booking();
create constraint trigger validate_sanispa_appointment_availability after insert or update on public.partner_appointments
deferrable initially deferred for each row execute function private.check_partner_technician_booking();

create function public.suggest_partner_appointment_slots(
  p_partner uuid, p_technician uuid, p_day date, p_duration integer, p_after timestamptz default null
) returns table(technician_id uuid, technician_name text, starts_at timestamptz, ends_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  with bounds as (
    select greatest(p_day, (now() at time zone 'Europe/Paris')::date) as first_day,
      greatest(now(), coalesce(p_after, now())) as earliest,
      make_interval(mins => p_duration) as duration
    where p_duration between 1 and 720 and p_day <= current_date + 730
  ), members as materialized (
    select t.id, t.name, w.hours
    from public.partner_planning_technicians t
    left join public.partner_technician_workweeks w on w.partner_id = t.partner_id and w.technician_id = t.id
    where t.partner_id = p_partner and (p_technician is null or t.id = p_technician)
  ), busy as materialized (
    select m.id as technician_id, booking.starts_at, booking.ends_at from members m cross join bounds b
    cross join lateral private.partner_technician_bookings(p_partner, m.id,
      (b.first_day::timestamp at time zone 'Europe/Paris'), ((b.first_day + 14)::timestamp at time zone 'Europe/Paris')) booking
    union all
    select a.technician_id, a.starts_at, a.ends_at
    from public.partner_technician_absences a join members m on m.id = a.technician_id cross join bounds b
    where a.partner_id = p_partner
      and a.starts_at < ((b.first_day + 14)::timestamp at time zone 'Europe/Paris')
      and a.ends_at > (b.first_day::timestamp at time zone 'Europe/Paris')
  ), working as (
    select m.id, m.name, b.duration, b.earliest,
      ((b.first_day + d.offset_days + h."start") at time zone 'Europe/Paris') as begins,
      ((b.first_day + d.offset_days + h."end") at time zone 'Europe/Paris') as finishes
    from members m cross join bounds b cross join generate_series(0, 13) d(offset_days)
    cross join lateral jsonb_to_recordset(coalesce(m.hours, '[{"weekday":1,"start":"08:00","end":"18:00"},{"weekday":2,"start":"08:00","end":"18:00"},{"weekday":3,"start":"08:00","end":"18:00"},{"weekday":4,"start":"08:00","end":"18:00"},{"weekday":5,"start":"08:00","end":"18:00"}]'::jsonb))
      as h(weekday integer, "start" time, "end" time)
    where h.weekday = extract(isodow from b.first_day + d.offset_days)
  ), first_free as (
    select w.id, w.name, w.duration, available.slot
    from working w cross join lateral (
      select s.slot
      from generate_series(w.begins, w.finishes - w.duration, interval '15 minutes') s(slot)
      where s.slot >= w.earliest and not exists (
        select 1 from busy b where b.technician_id = w.id and b.starts_at < s.slot + w.duration and b.ends_at > s.slot
      )
      order by s.slot limit 1
    ) available
  )
  select f.id, f.name, f.slot, f.slot + f.duration
  from first_free f order by f.slot, f.name, f.id limit 6;
$$;

revoke all on function private.lock_partner_technician_availability(),
  private.partner_technician_bookings(uuid, uuid, timestamptz, timestamptz),
  private.check_partner_technician_booking(), public.suggest_partner_appointment_slots(uuid, uuid, date, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function private.lock_partner_technician_availability(),
  private.partner_technician_bookings(uuid, uuid, timestamptz, timestamptz),
  private.check_partner_technician_booking(), public.suggest_partner_appointment_slots(uuid, uuid, date, integer, timestamptz)
  to service_role;
