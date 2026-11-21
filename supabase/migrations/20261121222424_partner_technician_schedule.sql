create table public.partner_planning_technicians (
  partner_id uuid not null references public.partners(id),
  id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 100),
  primary key (partner_id, id)
);

alter table public.partner_planning_technicians enable row level security;
revoke all on public.partner_planning_technicians from public, anon, authenticated;
grant select, insert on public.partner_planning_technicians to service_role;

alter table public.partner_private_visits add column technician_id uuid,
  add constraint partner_private_visits_technician_fk foreign key (partner_id, technician_id)
  references public.partner_planning_technicians(partner_id, id);
alter table public.partner_appointments add column technician_id uuid,
  add constraint partner_appointments_technician_fk foreign key (partner_id, technician_id)
  references public.partner_planning_technicians(partner_id, id);

create index partner_private_visits_technician_idx on public.partner_private_visits(partner_id, technician_id)
  where technician_id is not null;
create index partner_appointments_technician_idx on public.partner_appointments(partner_id, technician_id)
  where technician_id is not null;

create or replace function public.save_partner_appointment(p_diagnostic uuid,p_partner uuid,p_actor uuid,p_start timestamptz,p_end timestamptz) returns void
language plpgsql security invoker set search_path='' as $$
declare d public.diagnostics;
begin
 select * into d from public.diagnostics where id=p_diagnostic for update;
 if d.id is null or d.assigned_partner_id is distinct from p_partner or d.archived_at is not null or d.status in ('CLOSED','terminé')
 or not exists(select 1 from public.partner_users u join public.partners p on p.id=u.partner_id where u.partner_id=p_partner and u.user_id=p_actor and u.active and p.active) then raise exception 'ASSIGNED_PARTNER_REQUIRED';end if;
 if p_start is null or p_end is null or p_start<now()-interval '5 minutes' then raise exception 'APPOINTMENT_IN_PAST';end if;
 insert into public.partner_appointments as appointment(diagnostic_id,partner_id,starts_at,ends_at) values(d.id,p_partner,p_start,p_end)
 on conflict(diagnostic_id) do update set partner_id=excluded.partner_id,starts_at=excluded.starts_at,ends_at=excluded.ends_at,updated_at=now(),
   technician_id=case when appointment.partner_id=excluded.partner_id then appointment.technician_id else null end;
 insert into public.diagnostic_activity(diagnostic_id,actor,status,event_type,metadata) values(d.id,p_actor::text,d.status,'appointment_scheduled',jsonb_build_object('starts_at',p_start,'ends_at',p_end));
end;$$;

create function public.move_partner_planned_appointment(
  p_partner uuid, p_actor uuid, p_source text, p_id uuid,
  p_expected timestamptz, p_start timestamptz, p_technician uuid
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  appointment record;
  new_end timestamptz;
begin
  if not exists (
    select 1 from public.partner_users u join public.partners p on p.id = u.partner_id
    where u.partner_id = p_partner and u.user_id = p_actor and u.active and p.active and p.verification_status <> 'pending'
  ) then
    raise exception 'ASSIGNED_PARTNER_REQUIRED';
  end if;
  if p_technician is not null and not exists (
    select 1 from public.partner_planning_technicians where partner_id = p_partner and id = p_technician
  ) then
    raise exception 'TECHNICIAN_NOT_FOUND';
  end if;

  if p_source = 'private' then
    select starts_at, ends_at, technician_id, updated_at into appointment
    from public.partner_private_visits where partner_id = p_partner and id = p_id for update;
  elsif p_source = 'sanispa' then
    -- Use the same lock order as scheduling and cancellation from the dossier.
    perform 1 from public.diagnostics
    where id = p_id and assigned_partner_id = p_partner and archived_at is null and status not in ('CLOSED','terminé')
    for update;
    if not found then raise exception 'ASSIGNED_PARTNER_REQUIRED'; end if;
    select starts_at, ends_at, technician_id, updated_at into appointment
    from public.partner_appointments where partner_id = p_partner and diagnostic_id = p_id for update;
  else
    raise exception 'APPOINTMENT_CHANGED';
  end if;

  if not found then raise exception 'APPOINTMENT_CHANGED'; end if;
  if appointment.starts_at = p_start and appointment.technician_id is not distinct from p_technician then return; end if;
  if p_start is null or not isfinite(p_start) or appointment.updated_at is distinct from p_expected then
    raise exception 'APPOINTMENT_CHANGED';
  end if;
  new_end := p_start + (appointment.ends_at - appointment.starts_at);
  if p_source = 'private' then
    update public.partner_private_visits
    set starts_at = p_start, ends_at = new_end, technician_id = p_technician, updated_at = clock_timestamp()
    where partner_id = p_partner and id = p_id;
  else
    perform public.save_partner_appointment(p_id, p_partner, p_actor, p_start, new_end);
    update public.partner_appointments set technician_id = p_technician
    where partner_id = p_partner and diagnostic_id = p_id;
  end if;
end;
$$;

revoke all on function public.move_partner_planned_appointment(uuid,uuid,text,uuid,timestamptz,timestamptz,uuid) from public, anon, authenticated;
grant execute on function public.move_partner_planned_appointment(uuid,uuid,text,uuid,timestamptz,timestamptz,uuid) to service_role;
