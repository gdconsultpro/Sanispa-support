create function public.find_admin_partner_account(p_actor uuid, p_email text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  account jsonb;
begin
  if not exists (select 1 from public.admin_users where user_id = p_actor and active) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  select jsonb_build_object(
    'id', u.id, 'email_confirmed_at', u.email_confirmed_at, 'banned_until', u.banned_until,
    'app_metadata', jsonb_build_object('partner_password_change_required', u.raw_app_meta_data->'partner_password_change_required')
  ) into strict account from auth.users u
  where u.deleted_at is null and lower(u.email) = lower(btrim(p_email));
  return account;
exception
  when no_data_found then return null;
  when too_many_rows then raise exception 'ACCOUNT_EMAIL_AMBIGUOUS';
end;
$$;

revoke all on function public.find_admin_partner_account(uuid, text) from public, anon, authenticated;
grant execute on function public.find_admin_partner_account(uuid, text) to service_role;
