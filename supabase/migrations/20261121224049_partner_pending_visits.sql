alter table public.partner_private_visits
  alter column starts_at drop not null,
  alter column ends_at drop not null,
  add constraint partner_private_visits_schedule_pair
    check ((starts_at is null) = (ends_at is null));

create index partner_private_visits_waiting_idx
  on public.partner_private_visits (partner_id, updated_at desc)
  where starts_at is null;
