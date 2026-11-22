create or replace function public.link_partner_account(p_partner uuid, p_user uuid, p_actor uuid, p_contact text, p_reactivate boolean, p_role text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare existing public.partner_users; result uuid;
begin
  perform 1 from public.admin_users where user_id=p_actor and active;
  if not found then raise exception 'ADMIN_REQUIRED'; end if;
  if p_role is null or p_role not in ('owner','technician') then raise exception 'PARTNER_ROLE_REQUIRED'; end if;
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
    if p_role = 'technician' and existing.role <> 'technician' then
      raise exception 'PARTNER_ROLE_CONFLICT';
    end if;
    if existing.active then return existing.id; end if;
    if not p_reactivate then raise exception 'ACCESS_INACTIVE'; end if;
    update public.partner_users set active=true,contact_name=btrim(p_contact) where id=existing.id;
    insert into public.partner_access_history(partner_id,user_id,actor,action) values(p_partner,p_user,p_actor,'reactivated');
    return existing.id;
  end if;
  insert into public.partner_users(partner_id,user_id,role,active,contact_name,created_by)
    values(p_partner,p_user,p_role,true,btrim(p_contact),p_actor) returning id into result;
  insert into public.partner_access_history(partner_id,user_id,actor,action) values(p_partner,p_user,p_actor,'linked');
  return result;
end;
$$;
