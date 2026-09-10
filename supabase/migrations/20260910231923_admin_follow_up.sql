begin;

alter table public.diagnostics
  add column next_action_text text,
  add column next_action_state text,
  add column next_action_version integer not null default 0,
  add constraint diagnostics_next_action_text_check check (
    next_action_text is null or char_length(btrim(next_action_text)) between 1 and 1000
  ),
  add constraint diagnostics_next_action_state_check check (
    next_action_state is null or next_action_state in ('pending', 'done', 'cancelled')
  ),
  add constraint diagnostics_next_action_version_check check (next_action_version >= 0);

alter table public.diagnostic_activity
  add column event_type text,
  add column old_status text,
  add column metadata jsonb;

-- Existing rows keep their original fields. A null event_type means only
-- "Statut enregistré"; no former state, action or note history is invented.
create index diagnostic_activity_diagnostic_created_idx
  on public.diagnostic_activity (diagnostic_id, created_at desc, id desc);

create or replace function public.update_sav(
  p_id uuid, p_status text, p_notes text, p_next timestamptz, p_actor text
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  previous public.diagnostics%rowtype;
begin
  if p_status is null or p_status not in ('en analyse', 'devis envoyé', 'RDV demandé', 'terminé', 'CLOSED') then
    raise exception 'INVALID_STATUS';
  end if;
  if p_notes is null or char_length(p_notes) > 10000 or p_actor is null or btrim(p_actor) = '' then
    raise exception 'INVALID_FOLLOW_UP';
  end if;

  select * into previous from public.diagnostics where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;

  -- p_next is retained only for compatibility with the existing API signature.
  -- The next action has its own versioned mutation; even a null p_next must not erase it.
  update public.diagnostics set status = p_status, internal_notes = p_notes where id = p_id;

  if previous.status is distinct from p_status then
    insert into public.diagnostic_activity (diagnostic_id, actor, status, event_type, old_status)
    values (p_id, p_actor, p_status, 'status_changed', previous.status);
  end if;
  if previous.internal_notes is distinct from p_notes then
    -- The event records that notes changed, never their sensitive contents.
    insert into public.diagnostic_activity (diagnostic_id, actor, status, event_type)
    values (p_id, p_actor, p_status, 'notes_updated');
  end if;
end;
$$;

create function public.update_admin_next_action(
  p_id uuid,
  p_operation text,
  p_text text,
  p_due_at timestamptz,
  p_expected_version integer,
  p_actor text
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  previous public.diagnostics%rowtype;
  updated public.diagnostics%rowtype;
  action_event text;
begin
  if p_operation is null or p_operation not in ('save', 'complete', 'cancel')
     or p_expected_version is null or p_expected_version < 0
     or p_actor is null or btrim(p_actor) = '' then
    raise exception 'NEXT_ACTION_INVALID';
  end if;
  if p_operation = 'save' and (
    p_text is null or char_length(btrim(p_text)) not between 1 and 1000
    or p_due_at is null or not isfinite(p_due_at)
  ) then
    raise exception 'NEXT_ACTION_INVALID';
  end if;
  if p_operation <> 'save' and (p_text is not null or p_due_at is not null) then
    raise exception 'NEXT_ACTION_INVALID';
  end if;

  select * into previous from public.diagnostics where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if previous.next_action_version <> p_expected_version or previous.next_action_version = 2147483647 then
    raise exception 'NEXT_ACTION_CONFLICT';
  end if;

  if p_operation = 'save' then
    action_event := case when previous.next_action_state = 'pending' then 'action_updated' else 'action_created' end;
    update public.diagnostics
      set next_action_text = btrim(p_text), next_action_at = p_due_at,
          next_action_state = 'pending', next_action_version = next_action_version + 1
      where id = p_id returning * into updated;
  else
    if previous.next_action_state is distinct from 'pending' then
      raise exception 'NEXT_ACTION_STATE';
    end if;
    action_event := case when p_operation = 'complete' then 'action_completed' else 'action_cancelled' end;
    update public.diagnostics
      set next_action_state = case when p_operation = 'complete' then 'done' else 'cancelled' end,
          next_action_version = next_action_version + 1
      where id = p_id returning * into updated;
  end if;

  insert into public.diagnostic_activity (diagnostic_id, actor, status, event_type, metadata)
  values (p_id, p_actor, updated.status, action_event, jsonb_build_object(
    'before', jsonb_build_object('text', previous.next_action_text, 'dueAt', previous.next_action_at, 'state', previous.next_action_state),
    'after', jsonb_build_object('text', updated.next_action_text, 'dueAt', updated.next_action_at, 'state', updated.next_action_state)
  ));

  return jsonb_build_object(
    'text', updated.next_action_text, 'dueAt', updated.next_action_at,
    'state', updated.next_action_state, 'version', updated.next_action_version
  );
end;
$$;

-- Both mutations run with the server's existing role, without elevated definer rights.
revoke all on function public.update_sav(uuid, text, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.update_admin_next_action(uuid, text, text, timestamptz, integer, text) from public, anon, authenticated;
grant execute on function public.update_sav(uuid, text, text, timestamptz, text) to service_role;
grant execute on function public.update_admin_next_action(uuid, text, text, timestamptz, integer, text) to service_role;
grant select, update on public.diagnostics to service_role;
revoke all on public.diagnostic_activity from public, anon, authenticated;
grant select, insert on public.diagnostic_activity to service_role;

commit;
