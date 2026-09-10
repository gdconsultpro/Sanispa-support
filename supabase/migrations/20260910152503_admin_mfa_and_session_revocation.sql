begin;
create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from public, anon, authenticated;
grant select on public.admin_users to service_role;

-- Only the server can ask for a verified token's session state. No Auth secrets are returned.
create function public.private_session_status(p_user uuid, p_session uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'active', exists(select 1 from auth.sessions s where s.id=p_session and s.user_id=p_user and (s.not_after is null or s.not_after>now())),
    'is_admin', exists(select 1 from public.admin_users a where a.user_id=p_user and a.active),
    'mfa_verified', exists(select 1 from auth.sessions s join auth.mfa_factors f on f.id=s.factor_id and f.user_id=s.user_id
      where s.id=p_session and s.user_id=p_user and s.aal='aal2' and f.status='verified' and f.factor_type='totp')
  );
$$;
revoke all on function public.private_session_status(uuid,uuid) from public, anon, authenticated;
grant execute on function public.private_session_status(uuid,uuid) to service_role;

-- Client records already use server routes; direct REST access would skip revocation checks.
drop policy if exists "Users manage own profile" on public.client_profiles;
drop policy if exists "Users manage own spas" on public.customer_spas;
revoke all on public.client_profiles, public.customer_spas from anon, authenticated;
commit;
