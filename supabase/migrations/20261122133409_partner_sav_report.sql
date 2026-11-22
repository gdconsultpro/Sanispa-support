alter table public.partner_field_sessions add column report_details jsonb;
alter table public.partner_field_photos add column kind text not null default 'extra'
  check (kind in ('extra','finish','serial','water','electrical','heating','receipt'));

create unique index partner_field_payment_receipt_per_session on public.partner_field_photos(session_id)
where kind='receipt';

create function public.store_partner_field_photo(p_partner uuid,p_actor uuid,p_session uuid,p_photo uuid,p_kind text)
returns void language plpgsql security invoker set search_path = '' as $$
declare session public.partner_field_sessions;
begin
  session := private.lock_partner_field_session(p_partner,p_actor,p_session);
  if session.submitted_at is not null then raise exception 'FIELD_ALREADY_FINISHED'; end if;
  if exists(select 1 from public.partner_field_photos where session_id=p_session and id=p_photo and kind=p_kind) then return; end if;
  if p_kind='receipt' and exists(select 1 from public.partner_field_photos where session_id=p_session and kind='receipt')
    then raise exception 'FIELD_RECEIPT_EXISTS'; end if;
  if (select count(*) from public.partner_field_photos where session_id=p_session) >= 12
    then raise exception 'FIELD_PHOTO_LIMIT'; end if;
  insert into public.partner_field_photos(session_id,id,kind) values(p_session,p_photo,p_kind);
end;
$$;

create function public.submit_structured_partner_field_report(
  p_partner uuid,p_actor uuid,p_session uuid,p_report uuid,p_performed timestamptz,p_findings text,p_actions text,p_next text,p_details jsonb
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  session public.partner_field_sessions;
  required_photos text[];
begin
  session := private.lock_partner_field_session(p_partner,p_actor,p_session);
  if session.submitted_at is not null and session.report_details is distinct from p_details then
    raise exception 'FIELD_ALREADY_FINISHED';
  end if;
  case p_details->>'template'
    when 'sav' then required_photos := array['finish'];
    when 'installation' then required_photos := array['serial','water','electrical','heating','finish'];
    else raise exception 'INVALID_FIELD_REPORT';
  end case;
  if exists (
    select 1 from unnest(required_photos) required(kind)
    where not exists(select 1 from public.partner_field_photos photo where photo.session_id=p_session and photo.kind=required.kind)
  ) then raise exception 'FIELD_REQUIRED_PHOTOS'; end if;

  perform public.submit_partner_field_report(p_partner,p_actor,p_session,p_report,p_performed,p_findings,p_actions,p_next);
  update public.partner_field_sessions set report_details=p_details where id=p_session;
end;
$$;

revoke all on function public.store_partner_field_photo(uuid,uuid,uuid,uuid,text),
  public.submit_structured_partner_field_report(uuid,uuid,uuid,uuid,timestamptz,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.store_partner_field_photo(uuid,uuid,uuid,uuid,text),
  public.submit_structured_partner_field_report(uuid,uuid,uuid,uuid,timestamptz,text,text,text,jsonb) to service_role;

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
  perform private.require_field_member(p_partner,p_actor);
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
