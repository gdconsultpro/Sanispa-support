create index notification_jobs_partner_approval_partner
  on public.notification_jobs ((payload->>'partnerId')) where kind = 'partner_approval';

create function public.admin_partner_approval_email_statuses(p_partners uuid[])
returns table (partner_id uuid, state text, sent_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select p.id, j.state, j.sent_at
  from public.partners p
  join lateral (
    select job.state, job.sent_at
    from public.notification_jobs job
    where job.kind = 'partner_approval'
      and job.payload->>'partnerId' = p.id::text
      and lower(job.payload->>'email') = lower(p.email)
      and (job.payload->>'verifiedAt')::timestamptz = p.verified_at
    order by job.created_at desc, job.id desc
    limit 1
  ) j on true
  where p.verification_status = 'verified' and p.id = any(p_partners);
$$;

revoke all on function public.admin_partner_approval_email_statuses(uuid[]) from public, anon, authenticated;
grant execute on function public.admin_partner_approval_email_statuses(uuid[]) to service_role;
