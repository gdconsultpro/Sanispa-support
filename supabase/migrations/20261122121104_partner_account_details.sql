create function public.update_partner_account(p_partner uuid, p_actor uuid, p_changes jsonb)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  company public.partners;
  new_siret text;
  siret_changed boolean;
begin
  select * into company from public.partners where id = p_partner and active for update;
  if not found then raise exception 'PARTNER_OWNER_REQUIRED'; end if;

  perform 1 from public.partner_users
  where partner_id = company.id and user_id = p_actor and active and role = 'owner'
  for share;
  if not found then raise exception 'PARTNER_OWNER_REQUIRED'; end if;

  new_siret := coalesce(p_changes->>'siret', company.siret);
  siret_changed := new_siret is distinct from company.siret;
  company.address := coalesce(p_changes->>'address', company.address);
  company.postal_code := coalesce(p_changes->>'postal_code', company.postal_code);
  company.city := coalesce(p_changes->>'city', company.city);
  company.phone := coalesce(p_changes->>'phone', company.phone);
  company.email := coalesce(p_changes->>'email', company.email);
  if siret_changed and (
    length(btrim(coalesce(company.address, ''))) < 3
    or coalesce(company.postal_code, '') !~ '^[0-9]{5}$'
    or length(btrim(coalesce(company.city, ''))) < 1
    or length(btrim(coalesce(company.phone, ''))) < 6
    or length(btrim(coalesce(company.email, ''))) < 1
  ) then
    raise exception 'CONTACT_REQUIRED';
  end if;

  update public.partners set
    address = company.address,
    postal_code = company.postal_code,
    city = company.city,
    phone = company.phone,
    email = company.email,
    siret = new_siret,
    verification_status = case when siret_changed then 'pending' else company.verification_status end,
    verified_at = case when siret_changed then null else company.verified_at end,
    verified_by = case when siret_changed then null else company.verified_by end
  where id = company.id
  returning * into company;

  return jsonb_build_object(
    'company', jsonb_build_object(
      'company_name', company.company_name, 'contact_name', company.contact_name,
      'email', company.email, 'phone', company.phone, 'address', company.address,
      'postal_code', company.postal_code, 'city', company.city, 'siret', company.siret,
      'verification_status', company.verification_status
    ),
    'siretChanged', siret_changed
  );
end;
$$;

create function public.verify_partner_registration(p_partner uuid, p_actor uuid, p_expected_siret text)
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  current_siret text;
begin
  if not exists (select 1 from public.admin_users where user_id = p_actor and active) then
    raise exception 'ADMIN_REQUIRED';
  end if;

  select siret into current_siret from public.partners where id = p_partner for update;
  if current_siret is distinct from p_expected_siret then raise exception 'SIRET_CHANGED'; end if;
  perform public.verify_partner_registration(p_partner, p_actor);
end;
$$;

revoke all on function public.update_partner_account(uuid, uuid, jsonb),
  public.verify_partner_registration(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.update_partner_account(uuid, uuid, jsonb),
  public.verify_partner_registration(uuid, uuid, text) to service_role;
