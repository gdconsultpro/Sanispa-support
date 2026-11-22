alter table public.partners add column registered_at timestamptz;

update public.partners as partner
set registered_at = registration.first_at
from (
  select partner_id, min(created_at) as first_at
  from public.partner_access_history
  where action = 'linked' and user_id = actor
  group by partner_id
) as registration
where partner.id = registration.partner_id;

create function private.record_partner_registration() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  update public.partners set registered_at = new.created_at
  where id = new.partner_id and registered_at is null;
  return new;
end;
$$;

create trigger record_partner_registration
after insert on public.partner_access_history
for each row when (new.action = 'linked' and new.user_id = new.actor)
execute function private.record_partner_registration();

create function public.delete_admin_partner(p_partner uuid, p_actor uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.admin_users where user_id = p_actor and active) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  -- Serialize with offer publication and writes protected by partner foreign keys.
  perform 1 from public.partners where id = p_partner for update;
  if not found then return; end if;

  -- Offers stored as arrays and purchases with cascading FKs need explicit protection.
  if exists (
    select 1 from public.diagnostics
    where partner_released_at is not null and matched_partner_ids @> array[p_partner]
  ) or exists (select 1 from public.lead_purchases where partner_id = p_partner) then
    raise exception 'PARTNER_HAS_HISTORY';
  end if;

  delete from public.partner_users where partner_id = p_partner;
  delete from public.partner_charter_acceptances where partner_id = p_partner;
  delete from public.partner_planning_technicians where partner_id = p_partner;
  -- A remaining operational FK rolls the full removal back.
  delete from public.partners where id = p_partner;
end;
$$;

revoke all on function private.record_partner_registration() from public, anon, authenticated;
revoke all on function public.delete_admin_partner(uuid, uuid) from public, anon, authenticated;
grant delete on public.partners, public.partner_users, public.partner_planning_technicians to service_role;
grant execute on function public.delete_admin_partner(uuid, uuid) to service_role;
