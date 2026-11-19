alter table public.care_reminders
  add column repeat_months int check (repeat_months between 1 and 120),
  add column repeat_years int check (repeat_years between 1 and 10),
  add constraint care_reminders_one_repeat_unit
    check (num_nonnulls(repeat_days, repeat_months, repeat_years) <= 1);

create or replace function public.complete_care_reminder(p_id uuid, p_user uuid, p_version int)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  reminder public.care_reminders;
  next_due_at timestamptz;
begin
  select * into reminder from public.care_reminders
    where id = p_id and user_id = p_user for update;
  if reminder.id is null or not public.customer_has_premium(p_user) then
    raise exception 'PREMIUM_REMINDER_REQUIRED';
  end if;
  if reminder.completed_at is not null then return; end if;
  if reminder.version is distinct from p_version then raise exception 'REMINDER_CONFLICT'; end if;

  next_due_at := case
    when reminder.repeat_days is not null then now() + make_interval(days => reminder.repeat_days)
    when reminder.repeat_months is not null or reminder.repeat_years is not null then
      ((now() at time zone 'Europe/Paris') + make_interval(
        months => coalesce(reminder.repeat_months, 0),
        years => coalesce(reminder.repeat_years, 0)
      )) at time zone 'Europe/Paris'
  end;

  insert into public.care_journal(user_id, spa_id, kind, performed_at, note)
    values(p_user, reminder.spa_id, reminder.kind, now(), reminder.title);
  update public.care_reminders
    set completed_at = case when next_due_at is null then now() end,
        due_at = coalesce(next_due_at, reminder.due_at),
        version = version + 1
    where id = reminder.id;
end;
$$;
