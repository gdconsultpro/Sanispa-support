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
  request_type text not null default 'TECHNICAL_REQUEST' check (request_type in ('TECHNICAL_REQUEST', 'WATER_ANALYSIS')),
  department text,
  matched_partner_ids uuid[] not null default '{}',
  status text not null default 'AVAILABLE' check (status in ('nouvelle', 'en analyse', 'devis envoyé', 'RDV demandé', 'terminé', 'NEW', 'AVAILABLE', 'ASSIGNED', 'CLOSED', 'WATER_ANALYSIS')),
  choice text check (choice in ('intervention', 'devis', 'remote')),
  payment_plan text check (payment_plan in ('photo', 'guided', 'premium', 'water')),
  payment_status text,
  customer_email_status text default 'pending',
  customer_email_error text,
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
  plan text not null check (plan in ('photo', 'guided', 'premium', 'water'))
);

create index if not exists diagnostics_customer_id_idx on diagnostics(customer_id);
create index if not exists diagnostics_department_idx on diagnostics(department);
create index if not exists diagnostics_request_type_idx on diagnostics(request_type);
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


create table if not exists water_assistance_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  diagnostic_id uuid references diagnostics(id) on delete cascade,
  customer_email text not null,
  customer_name text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'refunded')),
  resume_token text not null unique,
  current_step text not null default 'payment',
  expires_at timestamptz,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  paid_at timestamptz,
  last_activity_at timestamptz not null default now()
);

create table if not exists water_assistance_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id uuid not null references water_assistance_sessions(id) on delete cascade,
  role text not null check (role in ('assistant', 'user')),
  content text not null
);

create index if not exists water_assistance_sessions_email_idx on water_assistance_sessions(customer_email);
create index if not exists water_assistance_sessions_diagnostic_idx on water_assistance_sessions(diagnostic_id);
create index if not exists water_assistance_messages_session_idx on water_assistance_messages(session_id);

alter table water_assistance_sessions enable row level security;
alter table water_assistance_messages enable row level security;

create policy "Service role manages water assistance sessions" on water_assistance_sessions
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy "Service role manages water assistance messages" on water_assistance_messages
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');


create table if not exists client_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  phone text,
  address text,
  postal_code text,
  city text,
  spa_brand text,
  spa_model text,
  spa_year text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists customer_spas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brand text,
  model text,
  spa_year text,
  installation_type text,
  created_at timestamptz default now()
);

alter table client_profiles enable row level security;
alter table customer_spas enable row level security;

drop policy if exists "Users manage own profile" on client_profiles;
create policy "Users manage own profile" on client_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own spas" on customer_spas;
create policy "Users manage own spas" on customer_spas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Service role manages client profiles" on client_profiles;
create policy "Service role manages client profiles" on client_profiles
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "Service role manages customer spas" on customer_spas;
create policy "Service role manages customer spas" on customer_spas
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create table if not exists client_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  diagnostic_id uuid references diagnostics(id) on delete set null,
  spa_id uuid references customer_spas(id) on delete set null,
  document_type text not null,
  file_name text not null,
  mime_type text not null,
  file_size integer not null,
  storage_bucket text not null default 'client-documents',
  storage_path text not null,
  created_at timestamptz default now()
);

alter table client_documents enable row level security;

drop policy if exists "Users manage own client documents" on client_documents;
create policy "Users manage own client documents" on client_documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Service role manages client documents" on client_documents;
create policy "Service role manages client documents" on client_documents
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');


alter table diagnostics
add column if not exists customer_email_status text default 'pending';

alter table diagnostics
add column if not exists customer_email_error text;

alter table diagnostics
drop constraint if exists diagnostics_status_check;

alter table diagnostics
add constraint diagnostics_status_check
check (status in ('nouvelle', 'en analyse', 'devis envoyé', 'RDV demandé', 'terminé', 'NEW', 'AVAILABLE', 'ASSIGNED', 'CLOSED', 'WATER_ANALYSIS'));

alter table diagnostics
add column if not exists request_type text not null default 'TECHNICAL_REQUEST';

alter table diagnostics
drop constraint if exists diagnostics_request_type_check;

alter table diagnostics
add constraint diagnostics_request_type_check
check (request_type in ('TECHNICAL_REQUEST', 'WATER_ANALYSIS'));

alter table diagnostics
add column if not exists department text;

alter table diagnostics
add column if not exists matched_partner_ids uuid[] not null default '{}';

create index if not exists diagnostics_department_idx on diagnostics(department);
create index if not exists diagnostics_request_type_idx on diagnostics(request_type);

create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text,
  email text not null,
  phone text,
  address text,
  postal_code text,
  city text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table diagnostics
add column if not exists assigned_partner_id uuid references partners(id);

alter table diagnostics
add column if not exists assigned_at timestamptz;

alter table diagnostics
add column if not exists lead_locked_until timestamptz;

create index if not exists diagnostics_assigned_partner_idx on diagnostics(assigned_partner_id);
create index if not exists diagnostics_lead_locked_until_idx on diagnostics(lead_locked_until);

create table if not exists partner_departments (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  department text not null,
  unique(partner_id, department)
);

create table if not exists partner_users (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text default 'owner',
  active boolean default true,
  created_at timestamptz default now()
);

create unique index if not exists partner_users_partner_user_idx on partner_users(partner_id, user_id);
create index if not exists partner_users_user_idx on partner_users(user_id);
create index if not exists partner_users_partner_idx on partner_users(partner_id);

create table if not exists lead_purchases (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references diagnostics(id) on delete cascade,
  partner_id uuid not null references partners(id) on delete cascade,
  status text default 'pending',
  amount integer not null default 1000,
  stripe_checkout_session_id text,
  stripe_payment_id text,
  stripe_payment_intent_id text,
  paid_at timestamptz,
  locked_until timestamptz,
  purchased_at timestamptz not null default now(),
  unique(request_id, partner_id)
);

alter table lead_purchases
add column if not exists status text default 'pending';

alter table lead_purchases
add column if not exists stripe_checkout_session_id text;

alter table lead_purchases
add column if not exists stripe_payment_intent_id text;

alter table lead_purchases
add column if not exists paid_at timestamptz;

alter table lead_purchases
add column if not exists locked_until timestamptz;

create index if not exists partner_departments_department_idx on partner_departments(department);
create index if not exists partner_departments_partner_idx on partner_departments(partner_id);
create index if not exists lead_purchases_request_idx on lead_purchases(request_id);
create index if not exists lead_purchases_partner_idx on lead_purchases(partner_id);
create unique index if not exists lead_purchases_stripe_checkout_session_idx on lead_purchases(stripe_checkout_session_id) where stripe_checkout_session_id is not null;
create unique index if not exists lead_purchases_one_paid_per_request_idx on lead_purchases(request_id) where status = 'paid';

alter table partners enable row level security;
alter table partner_departments enable row level security;
alter table partner_users enable row level security;
alter table lead_purchases enable row level security;

drop policy if exists "Service role manages partners" on partners;
create policy "Service role manages partners" on partners
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "Service role manages partner departments" on partner_departments;
create policy "Service role manages partner departments" on partner_departments
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "Service role manages partner users" on partner_users;
create policy "Service role manages partner users" on partner_users
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "Service role manages lead purchases" on lead_purchases;
create policy "Service role manages lead purchases" on lead_purchases
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Phase partenaire future :
-- Lorsque l'authentification partenaire sera créée, ajouter des policies permettant
-- à auth.uid() de lire uniquement les lignes reliées à partner_users.user_id.
-- Pour l'instant, l'accès reste limité au service_role afin d'éviter toute fuite
-- de leads ou de coordonnées clients avant le développement de l'espace partenaire.
