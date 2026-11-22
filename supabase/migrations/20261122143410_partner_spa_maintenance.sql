create table public.partner_spa_maintenance (
  partner_id uuid not null,
  id uuid not null default gen_random_uuid(),
  client_id uuid not null,
  spa_id uuid not null,
  frequency integer not null check (frequency between 1 and 365),
  unit text not null check (unit in ('day','week','month','year')),
  next_due_on date not null check (isfinite(next_due_on)),
  anchor_day integer not null check (anchor_day between 1 and 31),
  active boolean not null default true,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (partner_id,id),
  unique (partner_id,client_id,spa_id),
  foreign key (partner_id,client_id,spa_id) references public.partner_client_spas(partner_id,client_id,id)
);

alter table public.partner_private_visits add column maintenance_plan_id uuid,
  add column maintenance_due_on date,
  add constraint partner_visit_maintenance_pair check (num_nonnulls(maintenance_plan_id,maintenance_due_on) in (0,2)),
  add constraint partner_visit_maintenance_fk foreign key (partner_id,maintenance_plan_id) references public.partner_spa_maintenance(partner_id,id);
create unique index partner_visit_maintenance_occurrence on public.partner_private_visits(partner_id,maintenance_plan_id,maintenance_due_on)
where maintenance_plan_id is not null;
create unique index partner_visit_maintenance_unfinished on public.partner_private_visits(partner_id,maintenance_plan_id)
where maintenance_plan_id is not null and completed_at is null;
create index partner_spa_maintenance_due on public.partner_spa_maintenance(next_due_on,partner_id,id) where active;
alter table public.partner_spa_maintenance enable row level security;
revoke all on public.partner_spa_maintenance from public,anon,authenticated;
grant select,insert,update on public.partner_spa_maintenance to service_role;

create function private.next_partner_maintenance_due(p_due date,p_today date,p_anchor integer,p_frequency integer,p_unit text)
returns date language plpgsql immutable security invoker set search_path = '' as $$
declare stride integer;
declare periods integer;
declare target_month date;
declare candidate date;
begin
  if p_unit in ('day','week') then
    stride := p_frequency * case when p_unit = 'week' then 7 else 1 end;
    return p_due + (greatest(0,p_today - p_due) / stride + 1) * stride;
  end if;
  stride := p_frequency * case when p_unit = 'year' then 12 else 1 end;
  periods := greatest(1, ((extract(year from p_today)::int - extract(year from p_due)::int) * 12 +
    extract(month from p_today)::int - extract(month from p_due)::int) / stride);
  target_month := (date_trunc('month',p_due::timestamp) + make_interval(months => periods * stride))::date;
  candidate := target_month + least(p_anchor, ((target_month + interval '1 month')::date - target_month)) - 1;
  if candidate > p_today then return candidate; end if;
  target_month := (target_month + make_interval(months => stride))::date;
  return target_month + least(p_anchor, ((target_month + interval '1 month')::date - target_month)) - 1;
end;
$$;

create function public.queue_partner_spa_maintenance(p_partner uuid default null, p_plan uuid default null)
returns integer language plpgsql security invoker set search_path = '' as $$
declare today date := (now() at time zone 'Europe/Paris')::date;
declare plan public.partner_spa_maintenance;
declare generated integer := 0;
begin
  for plan in
    select m.* from public.partner_spa_maintenance m
    join public.partners p on p.id = m.partner_id
    join public.partner_private_clients c on c.partner_id = m.partner_id and c.id = m.client_id
    where m.active and m.next_due_on <= today
      and (p_partner is null or m.partner_id = p_partner) and (p_plan is null or m.id = p_plan)
      and p.active and p.verification_status <> 'pending' and c.deleted_at is null
      and btrim(c.street) <> '' and btrim(c.city) <> '' and c.postal_code ~ '^[0-9]{5}$'
      and not exists (select 1 from public.partner_private_visits v
        where v.partner_id = m.partner_id and v.maintenance_plan_id = m.id and v.completed_at is null)
    order by m.next_due_on,m.partner_id,m.id
    limit 250 for update of m skip locked for share of p,c skip locked
  loop
    -- The plan row is locked in this transaction and the occurrence constraints guard retries.
    insert into public.partner_private_visits(partner_id,id,client_id,spa_id,title,description,maintenance_plan_id,maintenance_due_on)
    select plan.partner_id,gen_random_uuid(),plan.client_id,plan.spa_id,'Entretien / révision',
      'Entretien récurrent · ' || concat_ws(' ',s.brand,nullif(s.model,'')) ||
        case when s.serial_number <> '' then ' · N° ' || s.serial_number else '' end,plan.id,plan.next_due_on
    from public.partner_client_spas s where s.partner_id=plan.partner_id and s.client_id=plan.client_id and s.id=plan.spa_id
    on conflict (partner_id,maintenance_plan_id,maintenance_due_on) where maintenance_plan_id is not null do nothing;
    if found then generated := generated + 1; end if;
    update public.partner_spa_maintenance
    set next_due_on = private.next_partner_maintenance_due(plan.next_due_on,today,plan.anchor_day,plan.frequency,plan.unit),
      updated_at = clock_timestamp()
    where partner_id = plan.partner_id and id = plan.id;
  end loop;
  return generated;
end;
$$;

create function public.save_partner_spa_maintenance(
  p_partner uuid,p_actor uuid,p_client uuid,p_spa uuid,p_frequency integer,p_unit text,p_due date,p_active boolean,p_expected timestamptz
) returns void language plpgsql security invoker set search_path = '' as $$
declare plan_id uuid;
begin
  perform private.require_field_member(p_partner,p_actor);
  perform 1 from public.partner_client_spas s
  join public.partner_private_clients c on c.partner_id=s.partner_id and c.id=s.client_id
  where s.partner_id=p_partner and s.client_id=p_client and s.id=p_spa and c.deleted_at is null;
  if not found then raise exception 'MAINTENANCE_SPA_NOT_FOUND'; end if;
  if p_active and not exists (
    select 1 from public.partner_private_clients c where c.partner_id=p_partner and c.id=p_client
    and btrim(c.street) <> '' and btrim(c.city) <> '' and c.postal_code ~ '^[0-9]{5}$'
  ) then raise exception 'MAINTENANCE_ADDRESS_REQUIRED'; end if;
  if p_expected is null then
    insert into public.partner_spa_maintenance(partner_id,client_id,spa_id,frequency,unit,next_due_on,anchor_day,active)
    values(p_partner,p_client,p_spa,p_frequency,p_unit,p_due,extract(day from p_due)::int,p_active)
    on conflict(partner_id,client_id,spa_id) do nothing returning id into plan_id;
  else
    update public.partner_spa_maintenance
    set frequency=p_frequency,unit=p_unit,
      anchor_day=case when next_due_on=p_due then anchor_day else extract(day from p_due)::int end,
      next_due_on=p_due,active=p_active,updated_at=clock_timestamp()
    where partner_id=p_partner and client_id=p_client and spa_id=p_spa and updated_at=p_expected returning id into plan_id;
  end if;
  if not found then raise exception 'MAINTENANCE_CHANGED'; end if;
  if p_active then perform public.queue_partner_spa_maintenance(p_partner,plan_id); end if;
end;
$$;

revoke all on function private.next_partner_maintenance_due(date,date,integer,integer,text),
  public.queue_partner_spa_maintenance(uuid,uuid), public.save_partner_spa_maintenance(uuid,uuid,uuid,uuid,integer,text,date,boolean,timestamptz)
  from public,anon,authenticated;
grant execute on function private.next_partner_maintenance_due(date,date,integer,integer,text),
  public.queue_partner_spa_maintenance(uuid,uuid), public.save_partner_spa_maintenance(uuid,uuid,uuid,uuid,integer,text,date,boolean,timestamptz)
  to service_role;
