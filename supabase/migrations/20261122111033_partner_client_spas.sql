create table public.partner_client_spas (
  partner_id uuid not null,
  client_id uuid not null,
  id uuid not null,
  brand text not null check (length(btrim(brand)) between 1 and 100),
  model text not null default '' check (length(model) <= 100),
  serial_number text not null default '' check (length(serial_number) <= 100),
  updated_at timestamptz not null default now(),
  primary key (partner_id, client_id, id),
  foreign key (partner_id, client_id) references public.partner_private_clients(partner_id, id)
);

alter table public.partner_private_clients add column deleted_at timestamptz;
create index partner_private_clients_deleted on public.partner_private_clients(partner_id, deleted_at desc, id)
  where deleted_at is not null;

alter table public.partner_private_visits
  add column spa_id uuid,
  add constraint partner_private_visits_client_spa_fk
    foreign key (partner_id, client_id, spa_id) references public.partner_client_spas(partner_id, client_id, id);
create index partner_private_visits_by_spa on public.partner_private_visits (partner_id, client_id, spa_id) where spa_id is not null;

create table public.partner_client_spa_dossiers (
  partner_id uuid not null,
  client_id uuid not null,
  diagnostic_id uuid not null references public.diagnostics(id) on delete cascade,
  spa_id uuid not null,
  primary key (partner_id, client_id, diagnostic_id),
  foreign key (partner_id, client_id, spa_id) references public.partner_client_spas(partner_id, client_id, id)
);
create index partner_client_spa_dossiers_by_spa on public.partner_client_spa_dossiers (partner_id, client_id, spa_id);
create index partner_client_spa_dossiers_by_diagnostic on public.partner_client_spa_dossiers (diagnostic_id);

alter table public.partner_client_spas enable row level security;
alter table public.partner_client_spa_dossiers enable row level security;
revoke all on public.partner_client_spas, public.partner_client_spa_dossiers from public, anon, authenticated;
grant select, insert, update, delete on public.partner_client_spas, public.partner_client_spa_dossiers to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('partner-client-spa-photos','partner-client-spa-photos',false,524288,array['image/jpeg'])
on conflict(id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
