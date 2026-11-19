-- Display references are separate from UUIDs used for ownership and API routing.
alter table public.diagnostics add column public_reference text;
create table private.dossier_reference_counters (
  reference_base text primary key,
  last_number bigint not null check (last_number > 0)
);
alter table private.dossier_reference_counters enable row level security;
revoke all on private.dossier_reference_counters from public, anon, authenticated;
grant select, insert, update on private.dossier_reference_counters to service_role;

create function private.assign_dossier_reference() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare surname text; letters text; base text; serial bigint;
begin
  if TG_OP = 'UPDATE' and old.public_reference is not null then
    if new.public_reference is distinct from old.public_reference then
      raise exception 'DOSSIER_REFERENCE_IMMUTABLE';
    end if;
    return new;
  end if;
  -- Prefer the explicit surname saved in the customer profile.
  select coalesce(nullif(btrim(p.last_name), ''), c.name, 'Client') into surname
    from public.customers c left join public.client_profiles p on p.user_id = new.user_id
    where c.id = new.customer_id;
  letters := regexp_replace(translate(upper(replace(replace(coalesce(surname, 'Client'), 'œ', 'oe'), 'Œ', 'OE')),
    'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØÙÚÛÜÝŸ', 'AAAAAAACEEEEIIIINOOOOOOUUUUYY'), '[^A-Z]', '', 'g');
  base := coalesce(nullif(left(letters, 3), ''), 'CLI') || '-' || to_char(new.created_at at time zone 'Europe/Paris', 'DDMMYYYY');
  -- Atomic counter allocation also handles simultaneous submissions and deleted dossiers.
  insert into private.dossier_reference_counters(reference_base, last_number) values(base, 1)
    on conflict(reference_base) do update set last_number = private.dossier_reference_counters.last_number + 1
    returning last_number into serial;
  new.public_reference := base || case when serial = 1 then '' else '-' || lpad(serial::text, greatest(2, length(serial::text)), '0') end;
  return new;
end;
$$;
revoke all on function private.assign_dossier_reference() from public, anon, authenticated;
grant execute on function private.assign_dossier_reference() to service_role;
create trigger assign_dossier_reference before insert or update of public_reference on public.diagnostics
  for each row execute function private.assign_dossier_reference();

-- Give existing dossiers stable references using their original creation date.
do $$ declare dossier record; begin
  for dossier in select id from public.diagnostics order by created_at, id loop
    update public.diagnostics set public_reference = null where id = dossier.id;
  end loop;
end $$;
alter table public.diagnostics alter column public_reference set not null;
alter table public.diagnostics add constraint diagnostics_public_reference_unique unique(public_reference);
comment on column public.diagnostics.public_reference is 'Stable customer-facing surname prefix and Paris creation date; UUID remains the authorization key.';
