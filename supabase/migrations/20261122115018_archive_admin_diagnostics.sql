create function public.archive_admin_diagnostics(p_actor uuid, p_ids uuid[])
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  archived_count integer;
begin
  if not exists (select 1 from public.admin_users where user_id = p_actor and active)
    then raise exception 'ADMIN_REQUIRED'; end if;
  update public.diagnostics set archived_at = now() where id = any(p_ids) and archived_at is null;
  get diagnostics archived_count = row_count;
  return archived_count;
end;
$$;

revoke all on function public.archive_admin_diagnostics(uuid,uuid[]) from public, anon, authenticated;
grant execute on function public.archive_admin_diagnostics(uuid,uuid[]) to service_role;
