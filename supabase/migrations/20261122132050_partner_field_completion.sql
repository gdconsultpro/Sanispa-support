alter table public.partner_private_visits add column previous_report jsonb;

create unique index partner_private_visit_followup_per_report
on public.partner_private_visits (partner_id, (previous_report->>'source'), (previous_report->>'visitId'), (previous_report->>'id'))
where previous_report is not null;

-- Submit and validate private field reports in one transaction.
create or replace function public.submit_partner_field_report(
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
    update public.partner_private_visits set completed_at=finished.at,validated_at=finished.at,updated_at=finished.at
    from (select clock_timestamp() as at) finished
    where partner_id=p_partner and id=session.private_visit_id and completed_at is null and starts_at<=finished.at;
    if not found then raise exception 'FIELD_ALREADY_FINISHED'; end if;
  end if;
  update public.partner_field_sessions set report_id=p_report,submitted_at=clock_timestamp(),performed_at=p_performed,
    findings=p_findings,actions=p_actions,next_steps=p_next where id=p_session;
end;
$$;

-- Let the technician close a field report submitted before this change.
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

create function public.create_partner_field_followup(
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
  perform private.require_field_member(p_partner,p_actor);
  if p_source='private' then
    select * into visit from public.partner_private_visits where partner_id=p_partner and id=p_id for update;
    if not found then raise exception 'FIELD_NOT_FOUND'; end if;
    select s.report_id as id,s.performed_at,s.findings,s.actions,s.next_steps into report
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
    select r.id,r.performed_at,r.findings,r.actions,r.next_steps into report
    from public.intervention_reports r where r.partner_id=p_partner and r.diagnostic_id=p_id and r.id=p_report;
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
      'actions',report.actions,'next_steps',report.next_steps,'source',p_source,'visitId',p_id))
  returning id into followup_id;
  return followup_id;
end;
$$;

revoke all on function public.create_partner_field_followup(uuid,uuid,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.create_partner_field_followup(uuid,uuid,text,uuid,uuid,text) to service_role;

alter table public.diagnostics add column partner_received_at timestamptz;

create function private.clear_partner_receipt_when_redispatched() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.partner_received_at := null;
  return new;
end;
$$;

create trigger clear_partner_receipt_when_redispatched
before update of partner_released_at on public.diagnostics
for each row when (old.partner_released_at is distinct from new.partner_released_at)
execute function private.clear_partner_receipt_when_redispatched();

create function public.acknowledge_partner_offer(
  p_partner uuid, p_actor uuid, p_diagnostic uuid, p_offered_at timestamptz
) returns timestamptz
language plpgsql security invoker set search_path = '' as $$
declare
  dossier public.diagnostics;
  received timestamptz;
begin
  perform private.require_field_member(p_partner,p_actor);
  select * into dossier from public.diagnostics
  where id=p_diagnostic and archived_at is null and request_type='TECHNICAL_REQUEST'
    and partner_kept_at is null and partner_released_at=p_offered_at and matched_partner_ids=array[p_partner]
    and (assigned_partner_id is null or assigned_partner_id=p_partner) for update;
  if not found then raise exception 'LEAD_UNAVAILABLE'; end if;
  if dossier.partner_received_at is not null then return dossier.partner_received_at; end if;
  received := clock_timestamp();
  update public.diagnostics set partner_received_at=received where id=p_diagnostic;
  insert into public.diagnostic_activity(diagnostic_id,actor,status,event_type,metadata)
  values (dossier.id,p_actor::text,dossier.status,'partner_offer_received',jsonb_build_object('partner_id',p_partner));
  return received;
end;
$$;

-- Confirm the first completed visit in the dossier history.
create function private.confirm_dispatched_intervention() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  dossier public.diagnostics;
  company text;
begin
  select * into dossier from public.diagnostics
  where id=new.diagnostic_id and assigned_partner_id=new.partner_id and archived_at is null
    and partner_released_at is not null and partner_kept_at is null;
  if not found or exists (select 1 from public.intervention_reports where diagnostic_id=new.diagnostic_id and id<>new.id)
    then return new; end if;
  select company_name into company from public.partners where id=new.partner_id;
  insert into public.diagnostic_activity(diagnostic_id,actor,status,event_type,metadata)
  values (dossier.id,new.author_id::text,dossier.status,'partner_intervention_confirmed',
    jsonb_build_object('company_name',company,'performed_at',new.performed_at));
  return new;
end;
$$;

create trigger confirm_dispatched_intervention after insert on public.intervention_reports
for each row execute function private.confirm_dispatched_intervention();

create function public.partner_dispatch_totals() returns table (sent bigint, completed bigint)
language sql stable security invoker set search_path = '' as $$
  select count(*), count(*) filter (where d.intervened_at is not null and d.intervened_partner_id is not null)
  from public.diagnostics d
  where d.partner_released_at is not null or exists(
    select 1 from public.diagnostic_activity a where a.diagnostic_id=d.id and a.event_type='partner_released'
  );
$$;

create function private.keep_partner_outcomes_in_app() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.state := 'cancelled';
  return new;
end;
$$;

create trigger keep_partner_outcomes_in_app before insert on public.notification_jobs
for each row when (new.kind in ('partner_accepted','partner_declined'))
execute function private.keep_partner_outcomes_in_app();

update public.notification_jobs set state='cancelled',locked_until=null
where kind in ('partner_accepted','partner_declined') and state='pending';

revoke all on function private.clear_partner_receipt_when_redispatched(), private.confirm_dispatched_intervention(),
  private.keep_partner_outcomes_in_app(), public.acknowledge_partner_offer(uuid,uuid,uuid,timestamptz), public.partner_dispatch_totals()
  from public,anon,authenticated;
grant execute on function public.acknowledge_partner_offer(uuid,uuid,uuid,timestamptz), public.partner_dispatch_totals() to service_role;
