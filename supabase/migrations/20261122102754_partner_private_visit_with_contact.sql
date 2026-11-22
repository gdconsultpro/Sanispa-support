create function public.create_partner_visit_with_contact(
  p_partner uuid, p_actor uuid, p_client jsonb, p_visit jsonb
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  contact record;
  visit record;
begin
  if not exists (
    select 1 from public.partner_users u join public.partners p on p.id = u.partner_id
    where u.partner_id = p_partner and u.user_id = p_actor and u.active and p.active and p.verification_status <> 'pending'
  ) then raise exception 'ASSIGNED_PARTNER_REQUIRED'; end if;

  select * into contact from jsonb_to_record(p_client) as info(
    id uuid, name text, phone text, email text, street text, postal_code text, city text,
    latitude double precision, longitude double precision
  );
  select * into visit from jsonb_to_record(p_visit) as info(
    id uuid, title text, description text, starts_at timestamptz, ends_at timestamptz, technician_id uuid
  );

  insert into public.partner_private_clients(
    partner_id, id, name, phone, email, street, postal_code, city, latitude, longitude, intervention_type, description
  ) values (
    p_partner, contact.id, contact.name, contact.phone, contact.email, contact.street, contact.postal_code, contact.city,
    contact.latitude, contact.longitude, visit.title, visit.description
  ) on conflict (partner_id, id) do nothing;

  if not found then
    -- A retry can acknowledge the original visit, including after edits, without reviving a removed visit.
    if exists (
      select 1 from public.partner_private_visits
      where partner_id = p_partner and id = visit.id and client_id = contact.id
    ) then return; end if;
    raise exception 'APPOINTMENT_CHANGED';
  end if;

  insert into public.partner_private_visits(partner_id, id, client_id, title, description, starts_at, ends_at, technician_id)
  values (p_partner, visit.id, contact.id, visit.title, visit.description, visit.starts_at, visit.ends_at, visit.technician_id);
end;
$$;

revoke all on function public.create_partner_visit_with_contact(uuid,uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.create_partner_visit_with_contact(uuid,uuid,jsonb,jsonb) to service_role;
