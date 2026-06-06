create extension if not exists "pgcrypto";

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  phone text not null,
  email text not null,
  address text not null,
  spa_brand text not null,
  spa_model text,
  spa_year text not null,
  installation_type text not null check (installation_type in ('interieur', 'exterieur')),
  power_supply text not null check (power_supply in ('230V', '400V', 'je ne sais pas'))
);

create table if not exists diagnostics (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  customer_id uuid not null references customers(id) on delete cascade,
  problem_type text not null,
  status text not null default 'nouvelle' check (status in ('nouvelle', 'en analyse', 'devis envoyé', 'RDV demandé', 'terminé')),
  choice text check (choice in ('intervention', 'devis', 'remote')),
  payment_plan text check (payment_plan in ('photo', 'guided', 'premium')),
  payment_status text,
  archived_at timestamptz
);

create table if not exists diagnostic_answers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  diagnostic_id uuid not null references diagnostics(id) on delete cascade,
  question_key text not null,
  question_label text not null,
  answer text not null
);

create table if not exists diagnostic_photos (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  diagnostic_id uuid not null references diagnostics(id) on delete cascade,
  photo_type text not null,
  storage_path text not null,
  public_url text
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  diagnostic_id uuid not null references diagnostics(id) on delete cascade,
  stripe_session_id text not null,
  stripe_payment_intent_id text,
  amount integer not null,
  currency text not null default 'eur',
  status text not null default 'pending',
  plan text not null check (plan in ('photo', 'guided', 'premium'))
);

create index if not exists diagnostics_customer_id_idx on diagnostics(customer_id);
create index if not exists diagnostic_answers_diagnostic_id_idx on diagnostic_answers(diagnostic_id);
create index if not exists diagnostic_photos_diagnostic_id_idx on diagnostic_photos(diagnostic_id);
create index if not exists payments_diagnostic_id_idx on payments(diagnostic_id);
create index if not exists diagnostics_archived_at_idx on diagnostics(archived_at);

insert into storage.buckets (id, name, public)
values ('diagnostic-photos', 'diagnostic-photos', true)
on conflict (id) do nothing;

alter table customers enable row level security;
alter table diagnostics enable row level security;
alter table diagnostic_answers enable row level security;
alter table diagnostic_photos enable row level security;
alter table payments enable row level security;

create policy "Service role manages customers" on customers
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy "Service role manages diagnostics" on diagnostics
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy "Service role manages diagnostic answers" on diagnostic_answers
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy "Service role manages diagnostic photos" on diagnostic_photos
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy "Service role manages payments" on payments
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy "Public photo read access" on storage.objects
  for select using (bucket_id = 'diagnostic-photos');

create policy "Service role photo uploads" on storage.objects
  for all using (bucket_id = 'diagnostic-photos' and auth.role() = 'service_role')
  with check (bucket_id = 'diagnostic-photos' and auth.role() = 'service_role');
