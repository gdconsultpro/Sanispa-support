alter table public.partner_private_visits
  add column completed_at timestamptz,
  add column validated_at timestamptz,
  add constraint partner_private_visits_completion_order check (
    (completed_at is null or (starts_at is not null and completed_at >= starts_at))
    and (validated_at is null or (completed_at is not null and validated_at >= completed_at))
  );

create function private.guard_completed_partner_visit() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if old.completed_at is not null and
    (new.starts_at, new.ends_at, new.technician_id) is distinct from (old.starts_at, old.ends_at, old.technician_id) then
    raise exception 'PARTNER_VISIT_FINISHED';
  end if;
  return new;
end;
$$;

create trigger guard_completed_partner_visit before update of starts_at, ends_at, technician_id
on public.partner_private_visits for each row execute function private.guard_completed_partner_visit();

create function public.advance_partner_private_visit(
  p_partner uuid, p_actor uuid, p_visit uuid, p_expected timestamptz, p_validate boolean
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  visit public.partner_private_visits;
  member_role text;
  changed_at timestamptz;
begin
  select u.role into member_role from public.partner_users u
  join public.partners p on p.id = u.partner_id
  where p.id = p_partner and p.active and p.verification_status <> 'pending' and u.active and u.user_id = p_actor
  for share of p, u;
  if not found or (p_validate and member_role <> 'owner') then raise exception 'PARTNER_WORK_ROLE_REQUIRED'; end if;

  select * into visit from public.partner_private_visits
  where partner_id = p_partner and id = p_visit for update;
  if not found then raise exception 'PARTNER_VISIT_NOT_FOUND'; end if;
  if (p_validate and visit.validated_at is not null) or (not p_validate and visit.completed_at is not null) then return; end if;
  changed_at := clock_timestamp();
  if visit.updated_at is distinct from p_expected or visit.starts_at is null or visit.starts_at > changed_at
    or (p_validate and visit.completed_at is null) then raise exception 'PARTNER_VISIT_STATE_CHANGED'; end if;

  if p_validate then
    update public.partner_private_visits set validated_at = changed_at, updated_at = changed_at
    where partner_id = p_partner and id = p_visit;
  else
    update public.partner_private_visits set completed_at = changed_at, updated_at = changed_at
    where partner_id = p_partner and id = p_visit;
  end if;
end;
$$;

revoke all on function public.advance_partner_private_visit(uuid, uuid, uuid, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.advance_partner_private_visit(uuid, uuid, uuid, timestamptz, boolean) to service_role;
