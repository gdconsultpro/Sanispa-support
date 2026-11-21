begin;

drop trigger enqueue_synchroteam_declaration on public.diagnostics;

alter table public.synchroteam_exports
  drop constraint synchroteam_exports_state_check,
  add constraint synchroteam_exports_state_check
    check (state in ('pending', 'sent', 'review', 'cancelled'));

-- Retain the history of automatically queued drafts that never reached Synchroteam.
update public.synchroteam_exports x
set state = 'cancelled'
from public.diagnostics d
where d.id = x.diagnostic_id
  and x.state in ('pending', 'review') and x.attempts = 0
  and x.sent_at is null and x.remote_job_id is null
  and (d.partner_kept_at is null or d.partner_released_at is not null
    or d.assigned_partner_id is not null);

create or replace function private.enqueue_synchroteam_declaration() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.synchroteam_exports as preparation (diagnostic_id, external_key)
  values (new.id, 'sanispa:' || new.id)
  on conflict (diagnostic_id) do update
    set state = 'pending', created_at = excluded.created_at
    where preparation.state = 'cancelled';
  return new;
end;
$$;

-- keep_partner_intervention writes this decision and its audit entry in the same transaction.
create trigger enqueue_synchroteam_internal_decision
after update of partner_kept_at on public.diagnostics
for each row
when (old.partner_kept_at is null and new.partner_kept_at is not null
  and new.partner_kept_by is not null and new.archived_at is null
  and new.partner_released_at is null and new.assigned_partner_id is null
  and new.request_type = 'TECHNICAL_REQUEST' and new.choice = 'intervention')
execute function private.enqueue_synchroteam_declaration();

commit;
