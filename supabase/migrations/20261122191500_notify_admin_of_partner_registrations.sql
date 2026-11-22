create or replace function private.record_partner_registration() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  company text;
begin
  update public.partners set registered_at = new.created_at
  where id = new.partner_id and registered_at is null
  returning company_name into company;

  if found then
    insert into public.notification_jobs(key, kind, payload)
    values (
      'partner-registration:' || new.partner_id,
      'partner_registration',
      jsonb_build_object('partnerId', new.partner_id, 'companyName', company)
    ) on conflict(key) do nothing;
  end if;

  return new;
end;
$$;

create or replace function public.claim_notifications(p_key text default null)
returns setof public.notification_jobs
language sql security invoker set search_path = '' as $$
  update public.notification_jobs
  set locked_until = now() + interval '2 minutes', attempts = attempts + 1,
      first_delivery_attempt_at = case when kind in (
        'partner', 'partner_accepted', 'partner_declined', 'client_report',
        'client_review_reminder', 'premium_care', 'tour_slot_changed',
        'partner_registration', 'visio_requested', 'visio_updated'
      ) then coalesce(first_delivery_attempt_at, case when attempts > 0 then created_at else now() end)
      else first_delivery_attempt_at end
  where id in (
    select id from public.notification_jobs
    where state = 'pending' and (locked_until is null or locked_until < now())
      and (p_key is null or key like p_key || '%')
    order by created_at limit 10 for update skip locked
  ) returning *;
$$;
