create function public.notify_partner_approval(p_partner uuid, p_actor uuid, p_expected_siret text)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  company public.partners;
  notification_key text;
begin
  if not exists (select 1 from public.admin_users where user_id = p_actor and active) then
    raise exception 'ADMIN_REQUIRED';
  end if;
  select * into company from public.partners where id = p_partner for update;
  if not found or not company.active then raise exception 'INCOMPLETE_REGISTRATION'; end if;

  if p_expected_siret is not null then
    if company.siret is distinct from p_expected_siret then raise exception 'SIRET_CHANGED'; end if;
    if company.verification_status <> 'verified' or company.verified_at is null then
      perform public.verify_partner_registration(p_partner, p_actor, p_expected_siret);
      select * into company from public.partners where id = p_partner;
    end if;
  elsif company.verification_status <> 'verified' or company.verified_at is null then
    raise exception 'PARTNER_NOT_VERIFIED';
  end if;

  notification_key := 'partner-approval:' || p_partner || ':' ||
    extract(epoch from company.verified_at)::text || ':' || md5(lower(company.email));
  insert into public.notification_jobs(key, kind, payload)
  values (notification_key, 'partner_approval', jsonb_build_object(
    'partnerId', p_partner, 'verifiedAt', company.verified_at, 'email', company.email, 'companyName', company.company_name
  ))
  on conflict (key) do nothing;

  return notification_key;
end;
$$;

revoke all on function public.notify_partner_approval(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.notify_partner_approval(uuid, uuid, text) to service_role;

create or replace function public.claim_notifications(p_key text default null)
returns setof public.notification_jobs
language sql security invoker set search_path = '' as $$
  update public.notification_jobs
  set locked_until = now() + interval '2 minutes', attempts = attempts + 1,
      first_delivery_attempt_at = case when kind in (
        'partner', 'partner_accepted', 'partner_declined', 'client_report',
        'client_review_reminder', 'premium_care', 'tour_slot_changed',
        'partner_registration', 'partner_approval', 'visio_requested', 'visio_updated'
      ) then coalesce(first_delivery_attempt_at, case when attempts > 0 then created_at else now() end)
      else first_delivery_attempt_at end
  where id in (
    select id from public.notification_jobs
    where state = 'pending' and (locked_until is null or locked_until < now())
      and (p_key is null or key like p_key || '%')
    order by created_at limit 10 for update skip locked
  ) returning *;
$$;
