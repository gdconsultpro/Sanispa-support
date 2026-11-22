alter table public.partner_users add column technician_id uuid,
  add constraint partner_user_technician_fk foreign key (partner_id,technician_id)
  references public.partner_planning_technicians(partner_id,id);
create unique index partner_users_one_account_per_technician
  on public.partner_users(partner_id,technician_id) where technician_id is not null;

create function public.set_partner_technician_account(p_partner uuid,p_actor uuid,p_user uuid,p_technician uuid,p_expected uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare account public.partner_users;
begin
  perform private.require_field_member(p_partner,p_actor);
  if not exists(select 1 from public.partner_users where partner_id=p_partner and user_id=p_actor and active and role='owner')
    then raise exception 'PARTNER_OWNER_REQUIRED'; end if;
  select * into account from public.partner_users where partner_id=p_partner and user_id=p_user and role='technician' for update;
  if not found or (p_technician is not null and account.active is not true) then raise exception 'TECHNICIAN_ACCOUNT_REQUIRED'; end if;
  if account.technician_id is not distinct from p_technician then return; end if;
  if account.technician_id is distinct from p_expected then raise exception 'TECHNICIAN_LINK_CHANGED'; end if;
  update public.partner_users set technician_id=p_technician where id=account.id;
end;
$$;
revoke all on function public.set_partner_technician_account(uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.set_partner_technician_account(uuid,uuid,uuid,uuid,uuid) to service_role;

create function public.link_partner_account(p_partner uuid, p_user uuid, p_actor uuid, p_contact text, p_reactivate boolean, p_role text)
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
create or replace function public.link_partner_account(p_partner uuid,p_user uuid,p_actor uuid,p_contact text,p_reactivate boolean default false)
returns uuid language sql security invoker set search_path = '' as $$
  select public.link_partner_account(p_partner,p_user,p_actor,p_contact,p_reactivate,'owner');
$$;
revoke all on function public.link_partner_account(uuid,uuid,uuid,text,boolean,text) from public,anon,authenticated;
grant execute on function public.link_partner_account(uuid,uuid,uuid,text,boolean,text) to service_role;
