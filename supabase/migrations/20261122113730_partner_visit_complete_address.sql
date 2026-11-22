create function public.create_partner_visit_for_client(p_partner uuid, p_actor uuid, p_visit jsonb, p_address jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  contact public.partner_private_clients;
  visit record;
  address record;
begin
  if not exists (
    select 1 from public.partner_users u join public.partners p on p.id = u.partner_id
    where u.partner_id = p_partner and u.user_id = p_actor and u.active and p.active and p.verification_status <> 'pending'
  ) then raise exception 'ASSIGNED_PARTNER_REQUIRED'; end if;

  select * into visit from jsonb_to_record(p_visit) as info(
    id uuid, client_id uuid, spa_id uuid, title text, description text, starts_at timestamptz, ends_at timestamptz, technician_id uuid
  );
  select * into contact from public.partner_private_clients
  where partner_id = p_partner and id = visit.client_id and deleted_at is null for update;
  if not found then raise exception 'CLIENT_NOT_FOUND'; end if;

  if exists (select 1 from public.partner_private_visits
    where partner_id = p_partner and id = visit.id and client_id = contact.id) then return; end if;

  select * into address from jsonb_to_record(coalesce(p_address, '{}'::jsonb)) as info(
    street text, postal_code text, city text, latitude double precision, longitude double precision
  );
  if btrim(contact.street) = '' or btrim(contact.city) = '' or contact.postal_code !~ '^[0-9]{5}$' then
    if nullif(btrim(address.street), '') is null or nullif(btrim(address.city), '') is null
      or coalesce(address.postal_code, '') !~ '^[0-9]{5}$' then raise exception 'CLIENT_ADDRESS_REQUIRED'; end if;
    update public.partner_private_clients set
      street = address.street, postal_code = address.postal_code, city = address.city,
      latitude = address.latitude, longitude = address.longitude, updated_at = now()
    where partner_id = p_partner and id = contact.id;
  elsif p_address is not null and (contact.street, contact.postal_code, contact.city)
    is distinct from (address.street, address.postal_code, address.city) then
    raise exception 'CLIENT_ADDRESS_CHANGED';
  end if;

  insert into public.partner_private_visits(partner_id, id, client_id, spa_id, title, description, starts_at, ends_at, technician_id)
  values (p_partner, visit.id, contact.id, visit.spa_id, visit.title, visit.description, visit.starts_at, visit.ends_at, visit.technician_id);
end;
$$;

revoke all on function public.create_partner_visit_for_client(uuid,uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.create_partner_visit_for_client(uuid,uuid,jsonb,jsonb) to service_role;
