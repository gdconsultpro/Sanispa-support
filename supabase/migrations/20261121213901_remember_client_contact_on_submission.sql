begin;

create or replace function public.submit_diagnostic(
  p_id uuid, p_user uuid, p_version int, p_department text, p_partners uuid[],
  p_answers jsonb, p_photos jsonb, p_jobs jsonb
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  submission_id uuid;
  contact jsonb;
begin
  submission_id := private.submit_diagnostic(
    p_id, p_user, p_version, p_department, '{}'::uuid[], p_answers, p_photos,
    coalesce((select jsonb_agg(job) from jsonb_array_elements(p_jobs) job
      where job->>'kind' <> 'partner'), '[]'::jsonb)
  );

  -- Use the submitted draft for street and city separately. A moving address
  -- belongs to that transport request, not to the client's profile.
  select payload into contact from public.diagnostic_drafts
  where id = submission_id and user_id = p_user and submitted_at is not null
    and payload->>'problemType' <> 'demenagement';

  if contact is not null and nullif(btrim(contact->>'email'), '') is not null then
    insert into public.client_profiles as profile (
      user_id, email, first_name, phone, address, postal_code, city
    ) values (
      p_user, contact->>'email', nullif(btrim(contact->>'name'), ''),
      nullif(btrim(contact->>'phone'), ''), nullif(btrim(contact->>'address'), ''),
      nullif(btrim(contact->>'postalCode'), ''), nullif(btrim(contact->>'city'), '')
    ) on conflict (user_id) do update set
      first_name = case when nullif(btrim(concat_ws(' ', profile.first_name, profile.last_name)), '') is null
        then excluded.first_name else profile.first_name end,
      phone = case when nullif(btrim(profile.phone), '') is null then excluded.phone else profile.phone end,
      address = case when nullif(btrim(profile.address), '') is null then excluded.address else profile.address end,
      postal_code = case when nullif(btrim(profile.postal_code), '') is null then excluded.postal_code else profile.postal_code end,
      city = case when nullif(btrim(profile.city), '') is null then excluded.city else profile.city end,
      updated_at = now()
    where (excluded.first_name is not null and nullif(btrim(concat_ws(' ', profile.first_name, profile.last_name)), '') is null)
      or (excluded.phone is not null and nullif(btrim(profile.phone), '') is null)
      or (excluded.address is not null and nullif(btrim(profile.address), '') is null)
      or (excluded.postal_code is not null and nullif(btrim(profile.postal_code), '') is null)
      or (excluded.city is not null and nullif(btrim(profile.city), '') is null);
  end if;
  return submission_id;
end;
$$;

commit;
