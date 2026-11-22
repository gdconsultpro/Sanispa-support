alter table public.partner_field_sessions add column customer_signature jsonb
  check (customer_signature is null or submitted_at is not null);

create function public.submit_signed_partner_field_report(
  p_partner uuid,p_actor uuid,p_session uuid,p_report uuid,p_performed timestamptz,
  p_findings text,p_actions text,p_next text,p_details jsonb,p_signature jsonb
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  session public.partner_field_sessions;
begin
  session := private.lock_partner_field_session(p_partner,p_actor,p_session);
  if session.submitted_at is not null and session.customer_signature is distinct from p_signature then
    raise exception 'FIELD_ALREADY_FINISHED';
  end if;
  if coalesce(length(btrim(p_signature->>'name')),0) not between 1 and 140
    or jsonb_typeof(p_signature->'strokes') is distinct from 'array'
    or octet_length(p_signature::text)>25000 then
    raise exception 'FIELD_INVALID_SIGNATURE';
  end if;
  if jsonb_array_length(p_signature->'strokes') not between 1 and 24 then
    raise exception 'FIELD_INVALID_SIGNATURE';
  end if;
  perform public.submit_structured_partner_field_report(p_partner,p_actor,p_session,p_report,p_performed,p_findings,p_actions,p_next,p_details);
  update public.partner_field_sessions set customer_signature=p_signature where id=p_session;
end;
$$;

revoke all on function public.submit_signed_partner_field_report(uuid,uuid,uuid,uuid,timestamptz,text,text,text,jsonb,jsonb)
  from public,anon,authenticated;
grant execute on function public.submit_signed_partner_field_report(uuid,uuid,uuid,uuid,timestamptz,text,text,text,jsonb,jsonb)
  to service_role;
