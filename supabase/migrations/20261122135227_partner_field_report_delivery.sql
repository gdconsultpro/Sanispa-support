create table public.partner_field_pdf_deliveries (
  report_id uuid not null references public.partner_field_sessions(report_id) on delete cascade,
  recipient text not null check (length(recipient) between 3 and 254),
  first_attempt_at timestamptz not null default clock_timestamp(),
  locked_until timestamptz,
  sent_at timestamptz,
  primary key (report_id, recipient)
);

alter table public.partner_field_pdf_deliveries enable row level security;
revoke all on public.partner_field_pdf_deliveries from public, anon, authenticated;
grant select, insert, update on public.partner_field_pdf_deliveries to service_role;

create function public.claim_partner_field_pdf_delivery(p_report uuid, p_recipient text, p_retry boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  delivery public.partner_field_pdf_deliveries;
  attempted timestamptz := clock_timestamp();
  lease timestamptz := attempted + interval '90 seconds';
begin
  insert into public.partner_field_pdf_deliveries(report_id,recipient,first_attempt_at,locked_until)
  values (p_report,p_recipient,attempted,lease)
  on conflict (report_id,recipient) do nothing;
  if found then return jsonb_build_object('state','claimed','lease',lease); end if;

  select * into delivery from public.partner_field_pdf_deliveries
  where report_id=p_report and recipient=p_recipient for update;
  if not found then return jsonb_build_object('state','unknown'); end if;
  if delivery.sent_at is not null then return jsonb_build_object('state','sent','sentAt',delivery.sent_at); end if;
  if delivery.locked_until > attempted then return jsonb_build_object('state','busy'); end if;
  if not p_retry or delivery.first_attempt_at <= attempted - interval '23 hours' then
    return jsonb_build_object('state','unknown');
  end if;
  update public.partner_field_pdf_deliveries set locked_until=lease where report_id=p_report and recipient=p_recipient;
  return jsonb_build_object('state','claimed','lease',lease);
end;
$$;

revoke all on function public.claim_partner_field_pdf_delivery(uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.claim_partner_field_pdf_delivery(uuid,text,boolean) to service_role;
