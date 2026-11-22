-- Persist the chosen signup journey on the Auth row, apart from editable profile metadata.
create function private.record_sanispa_signup_audience() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  audience text := new.raw_user_meta_data->>'sanispa_signup_audience';
begin
  if audience in ('customer', 'partner') then
    new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('sanispa_signup_audience', audience);
    new.raw_user_meta_data := new.raw_user_meta_data - 'sanispa_signup_audience';
  end if;
  return new;
end;
$$;

create trigger record_sanispa_signup_audience before insert on auth.users
for each row execute function private.record_sanispa_signup_audience();

create view private.admin_customer_accounts as
select u.id, u.email, u.created_at, u.email_confirmed_at, u.banned_until,
       nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '') as name,
       flags.shared_access, flags.has_history
from auth.users u
left join public.client_profiles p on p.user_id = u.id
cross join lateral (
  select (exists (select 1 from public.admin_users a where a.user_id = u.id)
    or exists (select 1 from public.partner_users m where m.user_id = u.id)) as shared_access,
    (exists (select 1 from public.diagnostics d where d.user_id = u.id)
    or exists (select 1 from public.client_documents doc where doc.user_id = u.id)) as has_history
) flags
where u.deleted_at is null and u.email is not null
  and (
    u.raw_app_meta_data->>'sanispa_signup_audience' = 'customer'
    or p.user_id is not null or flags.has_history
    or exists (select 1 from public.customer_spas s where s.user_id = u.id)
    or (not flags.shared_access and u.raw_app_meta_data->>'sanispa_signup_audience' is distinct from 'partner')
  );

create function public.list_admin_customer_accounts(p_actor uuid, p_search text, p_page integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.admin_users where user_id = p_actor and active) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  return (
    with matches as (
      select * from private.admin_customer_accounts c
      where strpos(lower(concat_ws(' ', c.name, c.email)), lower(coalesce(p_search, ''))) > 0
    ), page as (
      select * from matches order by created_at desc nulls last, id
      offset (greatest(coalesce(p_page, 1), 1)::bigint - 1) * 25 limit 25
    )
    select jsonb_build_object(
      'total', (select count(*) from matches),
      'accounts', coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc nulls last, id) from page), '[]'::jsonb)
    )
  );
end;
$$;

create function public.manage_admin_customer_account(p_actor uuid, p_user uuid, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  account private.admin_customer_accounts;
begin
  if not exists (select 1 from public.admin_users where user_id = p_actor and active) then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if p_action is null or p_action not in ('block', 'unblock', 'delete') then
    raise exception 'INVALID_ACCOUNT_ACTION';
  end if;

  perform 1 from auth.users where id = p_user and deleted_at is null for update;
  if not found and p_action = 'delete' then return; end if;
  if p_actor = p_user or exists (select 1 from public.admin_users where user_id = p_user)
    or exists (select 1 from public.partner_users where user_id = p_user) then
    raise exception 'ACCOUNT_SHARED';
  end if;
  select * into account from private.admin_customer_accounts where id = p_user;
  if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;

  if p_action = 'delete' then
    if account.has_history or exists(select 1 from storage.objects where owner_id = p_user::text or owner = p_user) then
      raise exception 'ACCOUNT_HAS_HISTORY';
    end if;
    delete from auth.users where id = p_user;
  elsif p_action = 'block' then
    update auth.users set banned_until = now() + interval '100 years', updated_at = now() where id = p_user;
    delete from auth.sessions where user_id = p_user;
  else
    update auth.users set banned_until = null, updated_at = now() where id = p_user;
  end if;
end;
$$;

revoke all on function private.record_sanispa_signup_audience() from public, anon, authenticated;
revoke all on private.admin_customer_accounts from public, anon, authenticated, service_role;
revoke all on function public.list_admin_customer_accounts(uuid, text, integer),
  public.manage_admin_customer_account(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.list_admin_customer_accounts(uuid, text, integer),
  public.manage_admin_customer_account(uuid, uuid, text) to service_role;
