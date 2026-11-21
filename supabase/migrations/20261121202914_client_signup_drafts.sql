begin;

create table public.client_signup_drafts (
    id uuid not null,
    user_id uuid not null references auth.users(id) on delete cascade,
    step text not null check (step in ('/diagnostic', '/questionnaire', '/upload', '/resume')),
    payload jsonb not null check (octet_length(payload::text) <= 2400000),
    expires_at timestamptz not null,
    primary key (user_id, id)
);

create index client_signup_drafts_expires_at_idx on public.client_signup_drafts (expires_at);
alter table public.client_signup_drafts enable row level security;
revoke all on table public.client_signup_drafts from public, anon, authenticated;
grant select, insert, update, delete on table public.client_signup_drafts to service_role;

create function public.claim_client_signup_draft(p_id uuid, p_user uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
    pending public.client_signup_drafts;
    draft jsonb;
begin
    -- Serialize retries and return the existing draft without overwriting progress.
    select * into pending
    from public.client_signup_drafts
    where id = p_id and user_id = p_user and expires_at > now()
    for update;

    select to_jsonb(d) into draft
    from public.diagnostic_drafts d
    where id = p_id and user_id = p_user;

    if pending.id is not null then
        if draft is null then
            draft := public.save_diagnostic_draft(p_id, p_user, 0, pending.step, pending.payload);
        end if;
        delete from public.client_signup_drafts where id = p_id and user_id = p_user;
    end if;
    return draft;
end;
$$;

revoke execute on function public.claim_client_signup_draft(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_client_signup_draft(uuid, uuid) to service_role;

commit;
