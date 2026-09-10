begin;
alter table public.diagnostics add column if not exists internal_notes text not null default '';
alter table public.diagnostics add column if not exists next_action_at timestamptz;
create table if not exists public.diagnostic_activity(id uuid primary key default gen_random_uuid(),diagnostic_id uuid references public.diagnostics(id) on delete cascade,actor text not null,status text not null,created_at timestamptz not null default now());
alter table public.diagnostic_activity enable row level security;
create or replace function public.update_sav(p_id uuid,p_status text,p_notes text,p_next timestamptz,p_actor text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if p_status not in ('en analyse','devis envoyé','RDV demandé','terminé','CLOSED') then raise exception 'INVALID_STATUS';end if;
 update diagnostics set status=p_status,internal_notes=p_notes,next_action_at=p_next where id=p_id;
 if not found then raise exception 'NOT_FOUND';end if;
 insert into diagnostic_activity(diagnostic_id,actor,status) values(p_id,p_actor,p_status);
end; $$;
revoke all on function public.update_sav(uuid,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.update_sav(uuid,text,text,timestamptz,text) to service_role;
commit;
-- Explicit server privileges also support projects with customized default privileges.
grant select,insert,update,delete on public.diagnostic_drafts,public.request_limits,public.notification_jobs,public.stripe_events,public.diagnostic_activity to service_role;
