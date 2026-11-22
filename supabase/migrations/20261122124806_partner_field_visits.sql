alter table public.partner_private_visits add column field_started_at timestamptz;

create or replace function private.guard_completed_partner_visit() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if (old.completed_at is not null or old.field_started_at is not null) and
    (new.starts_at, new.ends_at, new.technician_id) is distinct from (old.starts_at, old.ends_at, old.technician_id) then
    raise exception 'PARTNER_VISIT_FINISHED';
  end if;
  return new;
end;
$$;

create table public.partner_field_sessions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id),
  private_visit_id uuid,
  diagnostic_id uuid references public.diagnostics(id),
  appointment_start timestamptz not null,
  started_at timestamptz not null default clock_timestamp(),
  started_by uuid not null references auth.users(id),
  report_id uuid unique,
  submitted_at timestamptz,
  performed_at timestamptz,
  findings text,
  actions text,
  next_steps text,
  foreign key (partner_id, private_visit_id) references public.partner_private_visits(partner_id,id),
  check (num_nonnulls(private_visit_id,diagnostic_id) = 1),
  check (num_nonnulls(report_id,submitted_at,performed_at,findings,actions,next_steps) in (0,6)),
  unique (partner_id,private_visit_id),
  unique (diagnostic_id,appointment_start)
);

create table public.partner_field_photos (
  session_id uuid not null references public.partner_field_sessions(id) on delete cascade,
  id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (session_id,id)
);

alter table public.partner_field_sessions enable row level security;
alter table public.partner_field_photos enable row level security;
revoke all on public.partner_field_sessions, public.partner_field_photos from public,anon,authenticated;
grant select,insert,update,delete on public.partner_field_sessions, public.partner_field_photos to service_role;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('partner-field-photos','partner-field-photos',false,524288,array['image/jpeg'])
on conflict (id) do nothing;

create function private.require_field_member(p_partner uuid,p_actor uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (
    select 1 from public.partner_users u join public.partners p on p.id=u.partner_id
    where u.partner_id=p_partner and u.user_id=p_actor and u.active and p.active and p.verification_status<>'pending'
  ) then raise exception 'FIELD_ACCESS_REQUIRED'; end if;
end;
$$;

create function public.start_partner_field_visit(p_partner uuid,p_actor uuid,p_source text,p_id uuid) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  visit public.partner_private_visits;
  dossier public.diagnostics;
  appointment timestamptz;
  existing uuid;
begin
  perform private.require_field_member(p_partner,p_actor);
  if p_source='private' then
    select * into visit from public.partner_private_visits where partner_id=p_partner and id=p_id for update;
    if not found then raise exception 'FIELD_NOT_FOUND'; end if;
    select id into existing from public.partner_field_sessions where partner_id=p_partner and private_visit_id=p_id;
    if existing is not null then return existing; end if;
    if visit.completed_at is not null then raise exception 'FIELD_ALREADY_FINISHED'; end if;
    appointment := visit.starts_at;
  elsif p_source='sanispa' then
    select * into dossier from public.diagnostics where id=p_id and assigned_partner_id=p_partner and archived_at is null for update;
    if not found then raise exception 'FIELD_NOT_FOUND'; end if;
    if dossier.status in ('CLOSED','terminé') then raise exception 'FIELD_ALREADY_FINISHED'; end if;
    select starts_at into appointment from public.partner_appointments where diagnostic_id=p_id and partner_id=p_partner;
    select id into existing from public.partner_field_sessions
      where diagnostic_id=p_id and partner_id=p_partner and (appointment_start=appointment or submitted_at is null)
      order by started_at desc limit 1;
    if existing is not null then return existing; end if;
    if exists(select 1 from public.intervention_reports where diagnostic_id=p_id and
      (client_validated_at is null or performed_at>=appointment)) then raise exception 'FIELD_ALREADY_FINISHED'; end if;
  else
    raise exception 'FIELD_NOT_FOUND';
  end if;
  if appointment is null then raise exception 'FIELD_APPOINTMENT_REQUIRED'; end if;
  if appointment>clock_timestamp() then raise exception 'FIELD_TOO_EARLY'; end if;
  insert into public.partner_field_sessions(partner_id,private_visit_id,diagnostic_id,appointment_start,started_by)
    values(p_partner,case when p_source='private' then p_id end,case when p_source='sanispa' then p_id end,appointment,p_actor)
    returning id into existing;
  if p_source='private' then
    update public.partner_private_visits set field_started_at=clock_timestamp(),updated_at=clock_timestamp()
    where partner_id=p_partner and id=p_id;
  end if;
  return existing;
end;
$$;

create function private.lock_partner_field_session(p_partner uuid,p_actor uuid,p_session uuid) returns public.partner_field_sessions
language plpgsql security invoker set search_path = '' as $$
declare session public.partner_field_sessions;
begin
  perform private.require_field_member(p_partner,p_actor);
  select * into session from public.partner_field_sessions where partner_id=p_partner and id=p_session for update;
  if not found or (session.diagnostic_id is not null and not exists(
    select 1 from public.diagnostics where id=session.diagnostic_id and assigned_partner_id=p_partner and archived_at is null
  )) then raise exception 'FIELD_NOT_FOUND'; end if;
  return session;
end;
$$;

create function public.change_partner_field_photo(p_partner uuid,p_actor uuid,p_session uuid,p_photo uuid,p_remove boolean)
returns void language plpgsql security invoker set search_path = '' as $$
declare session public.partner_field_sessions;
begin
  session := private.lock_partner_field_session(p_partner,p_actor,p_session);
  if session.submitted_at is not null then raise exception 'FIELD_ALREADY_FINISHED'; end if;
  if p_remove then
    delete from public.partner_field_photos where session_id=p_session and id=p_photo;
  else
    if exists(select 1 from public.partner_field_photos where session_id=p_session and id=p_photo) then return; end if;
    if (select count(*) from public.partner_field_photos where session_id=p_session) >= 12
      then raise exception 'FIELD_PHOTO_LIMIT'; end if;
    insert into public.partner_field_photos(session_id,id) values(p_session,p_photo);
  end if;
end;
$$;

create function public.submit_partner_field_report(
  p_partner uuid,p_actor uuid,p_session uuid,p_report uuid,p_performed timestamptz,p_findings text,p_actions text,p_next text
) returns void language plpgsql security invoker set search_path = '' as $$
declare session public.partner_field_sessions;
begin
  session := private.lock_partner_field_session(p_partner,p_actor,p_session);
  if session.submitted_at is not null then
    if (session.report_id,session.performed_at,session.findings,session.actions,session.next_steps)
      is not distinct from (p_report,p_performed,p_findings,p_actions,p_next) then return; end if;
    raise exception 'FIELD_ALREADY_FINISHED';
  end if;
  if p_performed is null or not isfinite(p_performed) or p_performed>clock_timestamp()+interval '5 minutes'
     or coalesce(length(btrim(p_findings)),0) not between 20 and 5000
     or coalesce(length(btrim(p_actions)),0) not between 20 and 5000
     or coalesce(length(btrim(p_next)),0) not between 5 and 3000 then raise exception 'INVALID_FIELD_REPORT'; end if;
  if session.diagnostic_id is not null then
    perform public.submit_intervention_report(p_report,session.diagnostic_id,p_partner,p_actor,p_performed,p_findings,p_actions,p_next,true);
  else
    update public.partner_private_visits set completed_at=clock_timestamp(),updated_at=clock_timestamp()
    where partner_id=p_partner and id=session.private_visit_id and completed_at is null and starts_at<=clock_timestamp();
    if not found then raise exception 'FIELD_ALREADY_FINISHED'; end if;
  end if;
  update public.partner_field_sessions set report_id=p_report,submitted_at=clock_timestamp(),performed_at=p_performed,
    findings=p_findings,actions=p_actions,next_steps=p_next where id=p_session;
end;
$$;

revoke all on function private.require_field_member(uuid,uuid),private.lock_partner_field_session(uuid,uuid,uuid),
  public.start_partner_field_visit(uuid,uuid,text,uuid),public.change_partner_field_photo(uuid,uuid,uuid,uuid,boolean),
  public.submit_partner_field_report(uuid,uuid,uuid,uuid,timestamptz,text,text,text) from public,anon,authenticated;
grant execute on function private.require_field_member(uuid,uuid),private.lock_partner_field_session(uuid,uuid,uuid),
  public.start_partner_field_visit(uuid,uuid,text,uuid),public.change_partner_field_photo(uuid,uuid,uuid,uuid,boolean),
  public.submit_partner_field_report(uuid,uuid,uuid,uuid,timestamptz,text,text,text) to service_role;
