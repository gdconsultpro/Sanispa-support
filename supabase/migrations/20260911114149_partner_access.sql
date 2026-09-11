begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.partner_users add column contact_name text;
alter table public.partner_users add column created_by uuid;
create table public.partner_access_history (
  id uuid primary key default gen_random_uuid(), partner_id uuid not null references public.partners(id) on delete cascade,
  user_id uuid not null, actor uuid not null, created_at timestamptz not null default now(),
  action text not null check(action in ('linked','reactivated'))
);
alter table public.partner_access_history enable row level security;
revoke all on public.partner_access_history from public, anon, authenticated;
grant select,insert on public.partner_access_history to service_role;
create index partner_access_history_partner_idx on public.partner_access_history(partner_id,created_at desc);

create function public.link_partner_account(p_partner uuid, p_user uuid, p_actor uuid, p_contact text, p_reactivate boolean default false)
returns uuid language plpgsql security invoker set search_path='' as $$
declare existing public.partner_users; result uuid;
begin
  perform 1 from public.admin_users where user_id=p_actor and active;
  if not found then raise exception 'ADMIN_REQUIRED'; end if;
  if p_contact is null or char_length(btrim(p_contact)) not between 1 and 150 then raise exception 'CONTACT_REQUIRED'; end if;
  -- Serialize competing requests to link the same identity to different companies.
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 31415));
  perform 1 from public.partners where id=p_partner and active for share;
  if not found then raise exception 'PARTNER_REQUIRED'; end if;
  if exists(select 1 from public.partner_users where user_id=p_user and partner_id<>p_partner) then
    raise exception 'ACCOUNT_LINKED_ELSEWHERE';
  end if;
  select * into existing from public.partner_users where partner_id=p_partner and user_id=p_user for update;
  if existing.id is not null then
    if existing.active then return existing.id; end if;
    if not p_reactivate then raise exception 'ACCESS_INACTIVE'; end if;
    update public.partner_users set active=true,contact_name=btrim(p_contact) where id=existing.id;
    insert into public.partner_access_history(partner_id,user_id,actor,action) values(p_partner,p_user,p_actor,'reactivated');
    return existing.id;
  end if;
  insert into public.partner_users(partner_id,user_id,role,active,contact_name,created_by)
    values(p_partner,p_user,'owner',true,btrim(p_contact),p_actor) returning id into result;
  insert into public.partner_access_history(partner_id,user_id,actor,action) values(p_partner,p_user,p_actor,'linked');
  return result;
end;
$$;
revoke all on function public.link_partner_account(uuid,uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.link_partner_account(uuid,uuid,uuid,text,boolean) to service_role;

-- Auth owns the password. No password or hash is copied to application data.
-- Clear the server-owned obligation only within a successful Auth password update.
create or replace function private.partner_password_changed() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if old.encrypted_password is distinct from new.encrypted_password and coalesce(new.encrypted_password,'')<>''
     and old.raw_app_meta_data->'partner_password_change_required'='true'::jsonb then
    new.raw_app_meta_data := coalesce(new.raw_app_meta_data,'{}'::jsonb)-'partner_password_change_required';
  end if;
  return new;
end;
$$;
revoke all on function private.partner_password_changed() from public,anon,authenticated;
create trigger sanispa_partner_password_changed before update of encrypted_password on auth.users
  for each row execute function private.partner_password_changed();
commit;
