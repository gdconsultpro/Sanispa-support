-- Use the same work-item locks as the planner before granting a field mutation.
create function private.require_field_assignment(p_partner uuid,p_actor uuid,p_source text,p_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  membership public.partner_users;
  assigned_line uuid;
begin
  select u.* into membership from public.partner_users u join public.partners p on p.id=u.partner_id
  where u.partner_id=p_partner and u.user_id=p_actor and u.active and p.active and p.verification_status<>'pending'
  for share of u, p;
  if not found then raise exception 'FIELD_ACCESS_REQUIRED'; end if;
  if membership.role<>'owner' and membership.technician_id is null then raise exception 'FIELD_NOT_FOUND'; end if;
  if p_source='private' then
    select technician_id into assigned_line from public.partner_private_visits
    where partner_id=p_partner and id=p_id and (membership.role='owner' or starts_at is not null) for update;
  elsif p_source='sanispa' then
    perform 1 from public.diagnostics
    where id=p_id and assigned_partner_id=p_partner and archived_at is null for update;
    if not found then raise exception 'FIELD_NOT_FOUND'; end if;
    select technician_id into assigned_line from public.partner_appointments
    where partner_id=p_partner and diagnostic_id=p_id for update;
  else
    raise exception 'FIELD_NOT_FOUND';
  end if;
  if membership.role<>'owner' and assigned_line is distinct from membership.technician_id then raise exception 'FIELD_NOT_FOUND'; end if;
end;
$$;

revoke all on function private.require_field_assignment(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function private.require_field_assignment(uuid,uuid,text,uuid) to service_role;

create or replace function public.start_partner_field_visit(p_partner uuid,p_actor uuid,p_source text,p_id uuid) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  visit public.partner_private_visits;
  dossier public.diagnostics;
  appointment timestamptz;
  existing uuid;
begin
  perform private.require_field_assignment(p_partner,p_actor,p_source,p_id);
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

create or replace function private.lock_partner_field_session(p_partner uuid,p_actor uuid,p_session uuid) returns public.partner_field_sessions
language plpgsql security invoker set search_path = '' as $$
declare session public.partner_field_sessions;
begin
  select * into session from public.partner_field_sessions where partner_id=p_partner and id=p_session;
  if not found then raise exception 'FIELD_NOT_FOUND'; end if;
  perform private.require_field_assignment(p_partner,p_actor,
    case when session.private_visit_id is not null then 'private' else 'sanispa' end,
    coalesce(session.private_visit_id,session.diagnostic_id));
  select * into session from public.partner_field_sessions where partner_id=p_partner and id=p_session for update;
  if not found or (session.diagnostic_id is not null and not exists(
    select 1 from public.diagnostics where id=session.diagnostic_id and assigned_partner_id=p_partner and archived_at is null
  )) then raise exception 'FIELD_NOT_FOUND'; end if;
  return session;
end;
$$;

create or replace function public.advance_partner_private_visit(
  p_partner uuid, p_actor uuid, p_visit uuid, p_expected timestamptz, p_validate boolean
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  visit public.partner_private_visits;
  member_role text;
  changed_at timestamptz;
begin
  select u.role into member_role from public.partner_users u
  join public.partners p on p.id = u.partner_id
  where p.id = p_partner and p.active and p.verification_status <> 'pending' and u.active and u.user_id = p_actor
  for share of p, u;
  if not found then raise exception 'PARTNER_WORK_ROLE_REQUIRED'; end if;

  perform private.require_field_assignment(p_partner,p_actor,'private',p_visit);
  select * into visit from public.partner_private_visits
  where partner_id = p_partner and id = p_visit for update;
  if not found then raise exception 'PARTNER_VISIT_NOT_FOUND'; end if;
  if p_validate and member_role is distinct from 'owner' and not exists (
    select 1 from public.partner_field_sessions
    where partner_id=p_partner and private_visit_id=p_visit and started_by=p_actor and submitted_at is not null
  ) then raise exception 'PARTNER_WORK_ROLE_REQUIRED'; end if;
  if (p_validate and visit.validated_at is not null) or (not p_validate and visit.completed_at is not null) then return; end if;
  changed_at := clock_timestamp();
  if visit.updated_at is distinct from p_expected or visit.starts_at is null or visit.starts_at > changed_at
    or (p_validate and visit.completed_at is null) then raise exception 'PARTNER_VISIT_STATE_CHANGED'; end if;

  if p_validate then
    update public.partner_private_visits set validated_at = changed_at, updated_at = changed_at
    where partner_id = p_partner and id = p_visit;
  else
    update public.partner_private_visits set completed_at = changed_at, updated_at = changed_at
    where partner_id = p_partner and id = p_visit;
  end if;
end;
$$;

create or replace function public.create_partner_field_followup(
  p_partner uuid, p_actor uuid, p_source text, p_id uuid, p_report uuid, p_title text
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  visit public.partner_private_visits;
  contact public.partner_private_clients;
  dossier public.diagnostics;
  customer public.customers;
  report record;
  address_parts text[];
  next_client uuid;
  next_spa uuid;
  next_technician uuid;
  next_title text;
  followup_id uuid;
begin
  perform private.require_field_assignment(p_partner,p_actor,p_source,p_id);
  if p_source='private' then
    select * into visit from public.partner_private_visits where partner_id=p_partner and id=p_id for update;
    if not found then raise exception 'FIELD_NOT_FOUND'; end if;
    select s.report_id as id,s.performed_at,s.findings,s.actions,s.next_steps,s.report_details into report
    from public.partner_field_sessions s where s.partner_id=p_partner and s.private_visit_id=p_id and s.report_id=p_report;
    if not found then raise exception 'FIELD_REPORT_NOT_FOUND'; end if;
    next_client := visit.client_id;
    next_spa := visit.spa_id;
    next_technician := visit.technician_id;
    next_title := visit.title;
  elsif p_source='sanispa' then
    select * into dossier from public.diagnostics
    where id=p_id and assigned_partner_id=p_partner and archived_at is null for update;
    if not found then raise exception 'FIELD_NOT_FOUND'; end if;
    select r.id,r.performed_at,r.findings,r.actions,r.next_steps,s.report_details into report
    from public.intervention_reports r
    left join public.partner_field_sessions s on s.report_id=r.id and s.diagnostic_id=r.diagnostic_id and s.partner_id=r.partner_id
    where r.partner_id=p_partner and r.diagnostic_id=p_id and r.id=p_report;
    if not found then raise exception 'FIELD_REPORT_NOT_FOUND'; end if;
    select c.id,l.spa_id into next_client,next_spa
    from public.partner_private_clients c
    left join public.partner_client_spa_dossiers l on l.partner_id=c.partner_id and l.client_id=c.id and l.diagnostic_id=p_id
    where c.partner_id=p_partner and c.source_diagnostic_id=p_id;
    select a.technician_id into next_technician from public.partner_appointments a where a.partner_id=p_partner and a.diagnostic_id=p_id;
    next_title := p_title;
  else
    raise exception 'FIELD_NOT_FOUND';
  end if;

  select v.id into followup_id from public.partner_private_visits v
  where v.partner_id=p_partner and v.previous_report is not null and v.previous_report->>'source'=p_source
    and v.previous_report->>'visitId'=p_id::text and v.previous_report->>'id'=p_report::text;
  if found then return followup_id; end if;

  if p_source='sanispa' and next_client is null then
    select * into customer from public.customers where id=dossier.customer_id;
    if not found then raise exception 'FIELD_CLIENT_REQUIRED'; end if;
    address_parts := regexp_match(customer.address, '^(.+?) - ([0-9]{5}) - (.+)$');
    if address_parts is null then raise exception 'FIELD_ADDRESS_REQUIRED'; end if;
    insert into public.partner_private_clients(partner_id,id,source_diagnostic_id,name,phone,email,street,postal_code,city)
    values (p_partner,gen_random_uuid(),p_id,left(coalesce(nullif(btrim(customer.name),''),'Client SANISPA'),140),
      coalesce(customer.phone,''),coalesce(customer.email,''),left(address_parts[1],160),address_parts[2],left(address_parts[3],100))
    on conflict (partner_id,source_diagnostic_id) do nothing;
    select id into next_client from public.partner_private_clients where partner_id=p_partner and source_diagnostic_id=p_id;
  end if;

  select * into contact from public.partner_private_clients where partner_id=p_partner and id=next_client for update;
  if not found or contact.deleted_at is not null then raise exception 'FIELD_CLIENT_REQUIRED'; end if;
  if btrim(contact.street)='' or btrim(contact.city)='' or contact.postal_code !~ '^[0-9]{5}$'
  then raise exception 'FIELD_ADDRESS_REQUIRED'; end if;

  insert into public.partner_private_visits(partner_id,id,client_id,spa_id,technician_id,title,description,previous_report)
  values (p_partner,gen_random_uuid(),next_client,next_spa,next_technician,left(next_title,140),left(report.next_steps,2500),
    jsonb_build_object('id',report.id,'performed_at',report.performed_at,'findings',report.findings,
      'actions',report.actions,'next_steps',report.next_steps,'details',report.report_details,'source',p_source,'visitId',p_id))
  returning id into followup_id;
  return followup_id;
end;
$$;
