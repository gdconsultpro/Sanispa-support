create function public.link_partner_technician_account(
  p_partner uuid, p_user uuid, p_actor uuid, p_contact text, p_reactivate boolean,
  p_technician uuid, p_expected uuid
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  access_id uuid;
  current_line uuid;
begin
  access_id := public.link_partner_account(p_partner, p_user, p_actor, p_contact, p_reactivate, 'technician');
  select technician_id into current_line from public.partner_users where id = access_id;
  if current_line is not distinct from p_technician then return access_id; end if;
  if current_line is distinct from p_expected then raise exception 'TECHNICIAN_LINK_CHANGED'; end if;
  update public.partner_users set technician_id = p_technician where id = access_id;
  return access_id;
end;
$$;

revoke all on function public.link_partner_technician_account(uuid, uuid, uuid, text, boolean, uuid, uuid) from public, anon, authenticated;
grant execute on function public.link_partner_technician_account(uuid, uuid, uuid, text, boolean, uuid, uuid) to service_role;
