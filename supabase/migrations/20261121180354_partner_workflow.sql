begin;

create function public.decline_partner_offer(p_diagnostic uuid, p_partner uuid, p_actor uuid, p_offered_at timestamptz)
returns text
language plpgsql security invoker set search_path='' as $$
declare
  dossier public.diagnostics;
  company text;
  job_key text := 'partner-declined:' || p_diagnostic || ':' || p_partner || ':' || extract(epoch from p_offered_at)::text;
begin
  select * into dossier from public.diagnostics where id=p_diagnostic for update;
  select p.company_name into company from public.partner_users u
    join public.partners p on p.id=u.partner_id
    where u.user_id=p_actor and u.partner_id=p_partner and u.active and p.active
    for share of u,p;
  if company is null or dossier.id is null or dossier.archived_at is not null then
    raise exception 'OFFER_UNAVAILABLE';
  end if;
  if exists(select 1 from public.notification_jobs where key=job_key) then return job_key; end if;
  if not public.commercial_payments_paused()
     or p_offered_at is null or dossier.partner_released_at is distinct from p_offered_at
     or dossier.request_type <> 'TECHNICAL_REQUEST' or dossier.offer_version <> 2
     or dossier.status not in ('NEW','AVAILABLE','nouvelle')
     or dossier.partner_kept_at is not null or dossier.assigned_partner_id is not null
     or dossier.matched_partner_ids is distinct from array[p_partner]
     or exists(select 1 from public.lead_purchases where request_id=dossier.id and status in ('pending','paid','granted')) then
    raise exception 'OFFER_UNAVAILABLE';
  end if;

  update public.diagnostics set
    partner_released_at=null, partner_released_by=null, matched_partner_ids='{}',
    preview_description=null, preview_photo_paths='{}', lead_locked_until=null
  where id=dossier.id;

  update public.notification_jobs
    set key=key || ':declined:' || id::text,
        state=case when state='pending' then 'cancelled' else state end,
        locked_until=null
    where key=dossier.id || ':manual-partner:' || p_partner;

  insert into public.diagnostic_activity(diagnostic_id,actor,status,event_type,metadata)
    values(dossier.id,p_actor::text,dossier.status,'partner_declined',jsonb_build_object('partner_id',p_partner));
  insert into public.notification_jobs(key,kind,payload)
    values(job_key,'partner_declined',jsonb_build_object('diagnosticId',dossier.id,'partnerName',company,'notificationKey',job_key));
  return job_key;
end;$$;

create function public.cancel_partner_appointment(
  p_diagnostic uuid, p_partner uuid, p_actor uuid, p_start timestamptz, p_end timestamptz
) returns void
language plpgsql security invoker set search_path='' as $$
declare
  dossier public.diagnostics;
  appointment public.partner_appointments;
begin
  select * into dossier from public.diagnostics where id=p_diagnostic for update;
  if dossier.id is null or dossier.assigned_partner_id is distinct from p_partner
     or dossier.archived_at is not null or dossier.status in ('CLOSED','terminé')
     or not exists(select 1 from public.partner_users u join public.partners p on p.id=u.partner_id
       where u.partner_id=p_partner and u.user_id=p_actor and u.active and p.active) then
    raise exception 'ASSIGNED_PARTNER_REQUIRED';
  end if;
  select * into appointment from public.partner_appointments where diagnostic_id=dossier.id;
  if appointment.diagnostic_id is null then return; end if;
  if appointment.starts_at is distinct from p_start or appointment.ends_at is distinct from p_end
     or appointment.starts_at <= now() then
    raise exception 'APPOINTMENT_CHANGED';
  end if;
  delete from public.partner_appointments where diagnostic_id=dossier.id;
  insert into public.diagnostic_activity(diagnostic_id,actor,status,event_type,metadata)
    values(dossier.id,p_actor::text,dossier.status,'appointment_cancelled',jsonb_build_object('starts_at',appointment.starts_at,'ends_at',appointment.ends_at));
end;$$;

revoke all on function public.decline_partner_offer(uuid,uuid,uuid,timestamptz),
  public.cancel_partner_appointment(uuid,uuid,uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.decline_partner_offer(uuid,uuid,uuid,timestamptz),
  public.cancel_partner_appointment(uuid,uuid,uuid,timestamptz,timestamptz) to service_role;

create or replace function public.claim_notifications(p_key text default null)
returns setof public.notification_jobs
language sql security invoker set search_path='' as $$
  update public.notification_jobs set locked_until=now()+interval '2 minutes',attempts=attempts+1,
  first_delivery_attempt_at=case when kind in ('partner','partner_accepted','partner_declined','client_report','client_review_reminder','premium_care')
    then coalesce(first_delivery_attempt_at,case when attempts>0 then created_at else now() end) else first_delivery_attempt_at end
  where id in (select id from public.notification_jobs where state='pending' and (locked_until is null or locked_until<now())
    and (p_key is null or key like p_key||'%') order by created_at limit 10 for update skip locked) returning *;
$$;

commit;
