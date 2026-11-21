create table public.partner_private_clients (
  partner_id uuid not null references public.partners(id),
  id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 140),
  phone text not null default '',
  email text not null default '',
  street text not null,
  postal_code text not null check (postal_code = '' or postal_code ~ '^[0-9]{5}$'),
  city text not null,
  intervention_type text not null default 'Intervention SAV' check (length(btrim(intervention_type)) between 1 and 140),
  description text not null default '' check (length(description) <= 2500),
  latitude double precision,
  longitude double precision,
  source_diagnostic_id uuid references public.diagnostics(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (partner_id, id),
  unique (partner_id, source_diagnostic_id),
  check ((latitude is null and longitude is null)
    or (latitude is not null and longitude is not null
      and latitude between -85 and 85 and longitude between -180 and 180))
);

create table public.partner_private_visits (
  partner_id uuid not null,
  id uuid not null,
  client_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 140),
  description text not null default '' check (length(description) <= 2500),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (partner_id, id),
  foreign key (partner_id, client_id) references public.partner_private_clients(partner_id, id),
  check (ends_at > starts_at and ends_at <= starts_at + interval '12 hours')
);

create table public.partner_private_stock (
  partner_id uuid not null references public.partners(id),
  id uuid not null,
  category text not null check (category in ('piece','spa')),
  label text not null check (length(btrim(label)) between 1 and 140),
  reference text not null default '',
  quantity integer not null check (quantity between 0 and 1000000),
  updated_at timestamptz not null default now(),
  primary key (partner_id, id)
);

create index partner_private_clients_by_name on public.partner_private_clients (partner_id, name, id);
create index partner_private_visits_by_date on public.partner_private_visits (partner_id, starts_at);
create index partner_private_visits_by_client on public.partner_private_visits (partner_id, client_id);
create index partner_private_stock_by_label on public.partner_private_stock (partner_id, label, id);

alter table public.partner_private_clients enable row level security;
alter table public.partner_private_visits enable row level security;
alter table public.partner_private_stock enable row level security;
revoke all on public.partner_private_clients, public.partner_private_visits, public.partner_private_stock from public, anon, authenticated;
grant select, insert, update, delete on public.partner_private_clients, public.partner_private_visits, public.partner_private_stock to service_role;
grant select on public.customers to service_role;

create function private.create_partner_client_after_acquisition() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  contact public.customers;
  parts text[];
begin
  if not exists (
    select 1 from public.lead_purchases
    where request_id = new.id and partner_id = new.assigned_partner_id
      and ((status = 'paid' and paid_at is not null) or (status = 'granted' and not payment_required))
  ) then
    return new;
  end if;

  select * into contact from public.customers where id = new.customer_id;
  if not found then return new; end if;
  parts := regexp_match(contact.address, '^(?:(.*?) - )?([0-9]{5}) - (.*)$');
  insert into public.partner_private_clients (
    partner_id, id, source_diagnostic_id, name, phone, email, street, postal_code, city, intervention_type, description
  ) values (
    new.assigned_partner_id, gen_random_uuid(), new.id, left(coalesce(nullif(btrim(contact.name), ''), 'Client SANISPA'), 140),
    left(contact.phone, 35), left(contact.email, 254), left(coalesce(parts[1], case when parts is null then contact.address else '' end), 160),
    coalesce(parts[2], ''), left(coalesce(parts[3], ''), 100),
    case when new.problem_type = 'demenagement' then 'Déménagement' else 'Intervention SAV' end,
    left(coalesce(new.preview_description, ''), 2500)
  ) on conflict (partner_id, source_diagnostic_id) do nothing;
  return new;
end;
$$;

revoke all on function private.create_partner_client_after_acquisition() from public, anon, authenticated;

create trigger create_partner_client_after_acquisition
after update of assigned_partner_id on public.diagnostics
for each row when (
  new.assigned_partner_id is distinct from old.assigned_partner_id
  and new.assigned_partner_id is not null and new.partner_released_at is not null and new.partner_released_by is not null
  and new.assigned_partner_id = any(new.matched_partner_ids) and new.partner_kept_at is null and new.archived_at is null
  and new.request_type = 'TECHNICAL_REQUEST'
)
execute function private.create_partner_client_after_acquisition();
