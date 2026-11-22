alter table public.diagnostic_drafts
  add column cancelled_at timestamptz,
  add constraint cancelled_draft_is_empty check (
    cancelled_at is null or (submitted_at is null and payload = '{"problemType":""}'::jsonb)
  );

create function public.cancel_diagnostic_draft(p_id uuid, p_user uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  draft public.diagnostic_drafts;
  video_paths text[];
begin
  -- Lock signup claims in the same order as claim_client_signup_draft.
  delete from public.client_signup_drafts where id = p_id and user_id = p_user;

  -- Keep the ID reserved so an older tab cannot recreate the cancelled draft.
  insert into public.diagnostic_drafts as d (id, user_id, step, payload, cancelled_at)
  values (p_id, p_user, '/diagnostic', '{"problemType":""}'::jsonb, now())
  on conflict (id) do update
  set cancelled_at = now(), payload = excluded.payload, version = d.version + 1
  where d.user_id = p_user and d.submitted_at is null and d.cancelled_at is null
  returning * into draft;

  if draft.id is null then
    select * into draft from public.diagnostic_drafts where id = p_id and user_id = p_user;
    if draft.id is null then return jsonb_build_object('status', 'not_found'); end if;
    if draft.submitted_at is not null then return jsonb_build_object('status', 'submitted'); end if;
  end if;

  select coalesce(array_agg(storage_path), '{}'::text[]) into video_paths
  from public.moving_media_uploads where draft_id = p_id and user_id = p_user;

  delete from public.client_documents
  where draft_id = p_id and user_id = p_user and diagnostic_id is null;
  delete from public.moving_media_uploads where draft_id = p_id and user_id = p_user;

  return jsonb_build_object('status', 'cancelled', 'video_paths', video_paths);
end;
$$;

revoke execute on function public.cancel_diagnostic_draft(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_diagnostic_draft(uuid, uuid) to service_role;
