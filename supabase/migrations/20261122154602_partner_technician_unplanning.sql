alter table public.partner_private_visits
  add column unplanned_appointments jsonb not null default '[]'::jsonb;

create function public.unplan_partner_technician_appointment(
  p_partner uuid,p_actor uuid,p_source text,p_id uuid,p_expected timestamptz,p_reason text,p_note text
) returns void
language plpgsql security invoker set search_path='' as $$
declare
  line uuid;
  visit public.partner_private_visits;
  dossier public.diagnostics;
  appointment public.partner_appointments;
  change jsonb;
  previous_change jsonb;
begin
  select u.technician_id into line from public.partner_users u join public.partners p on p.id=u.partner_id
  where u.partner_id=p_partner and u.user_id=p_actor and u.active and u.role='technician'
    and p.active and p.verification_status<>'pending'
  for share of u,p;
  if line is null then raise exception 'FIELD_NOT_FOUND'; end if;
  if p_expected is null or p_reason is null or p_reason not in ('client_absent','no_access','report_requested','other')
     or char_length(coalesce(p_note,'')) > 300 then raise exception 'INVALID_UNPLAN_REASON'; end if;

  change := jsonb_build_object('reason',p_reason,'note',nullif(btrim(p_note),''),
    'partner_id',p_partner,'actor_id',p_actor,'technician_id',line,
    'appointment_version',p_expected,'unplanned_at',clock_timestamp());

  if p_source='private' then
    select * into visit from public.partner_private_visits where partner_id=p_partner and id=p_id for update;
    if not found or visit.technician_id is distinct from line then raise exception 'FIELD_NOT_FOUND'; end if;
    previous_change := visit.unplanned_appointments->-1;
    if visit.starts_at is null and previous_change->>'actor_id'=p_actor::text
       and (previous_change->>'appointment_version')::timestamptz=p_expected then return; end if;
    if visit.starts_at is null or visit.updated_at is distinct from p_expected then raise exception 'APPOINTMENT_CHANGED'; end if;
    if visit.field_started_at is not null or visit.completed_at is not null then raise exception 'APPOINTMENT_ALREADY_STARTED'; end if;
    change := change || jsonb_build_object('starts_at',visit.starts_at,'ends_at',visit.ends_at);
    update public.partner_private_visits
    set starts_at=null,ends_at=null,updated_at=clock_timestamp(),
        unplanned_appointments=unplanned_appointments || jsonb_build_array(change)
    where partner_id=p_partner and id=p_id;
  elsif p_source='sanispa' then
    select * into dossier from public.diagnostics
    where id=p_id and assigned_partner_id=p_partner and archived_at is null for update;
    if not found then raise exception 'FIELD_NOT_FOUND'; end if;
    select * into appointment from public.partner_appointments where diagnostic_id=p_id and partner_id=p_partner for update;
    if not found then
      if exists(select 1 from public.diagnostic_activity
        where diagnostic_id=p_id and event_type='appointment_cancelled'
        and metadata->>'actor_id'=p_actor::text and metadata->>'partner_id'=p_partner::text
        and (metadata->>'appointment_version')::timestamptz=p_expected)
      then return; end if;
      raise exception 'FIELD_NOT_FOUND';
    end if;
    if appointment.technician_id is distinct from line then raise exception 'FIELD_NOT_FOUND'; end if;
    if appointment.updated_at is distinct from p_expected then raise exception 'APPOINTMENT_CHANGED'; end if;
    if dossier.intervened_at is not null or dossier.status in ('CLOSED','terminé')
       or exists(select 1 from public.partner_field_sessions
         where partner_id=p_partner and diagnostic_id=p_id and submitted_at is null)
       or exists(select 1 from public.intervention_reports where diagnostic_id=p_id)
    then raise exception 'APPOINTMENT_ALREADY_STARTED'; end if;
    delete from public.partner_appointments where diagnostic_id=p_id and partner_id=p_partner;
    insert into public.diagnostic_activity(diagnostic_id,actor,status,event_type,metadata)
    values(p_id,p_actor::text,dossier.status,'appointment_cancelled',
      change || jsonb_build_object('starts_at',appointment.starts_at,'ends_at',appointment.ends_at));
  else
    raise exception 'FIELD_NOT_FOUND';
  end if;
end;
$$;

revoke all on function public.unplan_partner_technician_appointment(uuid,uuid,text,uuid,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.unplan_partner_technician_appointment(uuid,uuid,text,uuid,timestamptz,text,text) to service_role;
