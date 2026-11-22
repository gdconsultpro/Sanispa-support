create table public.partner_stock_movements (
  partner_id uuid not null,
  id uuid not null default gen_random_uuid(),
  stock_id uuid not null,
  category text not null check (category in ('piece', 'spa')),
  label text not null,
  reference text not null,
  delta integer not null check (delta <> 0),
  quantity_after integer not null check (quantity_after between 0 and 1000000),
  kind text not null check (kind in ('opening', 'adjustment', 'import', 'use', 'return')),
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  field_session_id uuid,
  field_source text check (field_source in ('private', 'sanispa')),
  field_visit_id uuid,
  usage_quantity integer check (usage_quantity between 0 and 1000000),
  check ((kind in ('opening','import','return') and delta > 0) or (kind = 'use' and delta < 0) or kind = 'adjustment'),
  check (
    (kind not in ('use','return') and num_nonnulls(field_session_id, field_source, field_visit_id, usage_quantity) = 0)
    or (kind in ('use','return') and category = 'piece' and num_nonnulls(field_session_id, field_source, field_visit_id, usage_quantity) = 4)
  ),
  primary key (partner_id, id),
  foreign key (partner_id, stock_id) references public.partner_private_stock(partner_id, id) on delete restrict
);

create index partner_stock_movements_history on public.partner_stock_movements (partner_id, created_at desc, id desc);
create index partner_stock_movements_article on public.partner_stock_movements (partner_id, stock_id, created_at desc, id desc);
create index partner_stock_movements_visit on public.partner_stock_movements (partner_id, field_source, field_visit_id, field_session_id, stock_id)
where field_session_id is not null;
create index partner_stock_movements_actor on public.partner_stock_movements (actor_id) where actor_id is not null;

alter table public.partner_stock_movements enable row level security;
revoke all on public.partner_stock_movements from public, anon, authenticated;
grant select, insert on public.partner_stock_movements to service_role;

create function public.save_partner_inventory_item(
  p_partner uuid, p_actor uuid, p_stock uuid, p_category text, p_label text, p_reference text, p_quantity integer, p_expected timestamptz
) returns void language plpgsql security invoker set search_path = '' as $$
declare stock public.partner_private_stock;
declare difference integer;
begin
  perform private.require_field_member(p_partner, p_actor);
  if p_expected is null then
    insert into public.partner_private_stock(partner_id, id, category, label, reference, quantity)
    values(p_partner, p_stock, p_category, p_label, p_reference, p_quantity)
    on conflict (partner_id, id) do nothing returning * into stock;
    if not found then return; end if;
    difference := stock.quantity;
  else
    select * into stock from public.partner_private_stock where partner_id = p_partner and id = p_stock for update;
    if not found or stock.updated_at is distinct from p_expected then raise exception 'STOCK_CHANGED'; end if;
    if stock.category = 'piece' and p_category <> stock.category and exists (
      select 1 from public.partner_stock_movements where partner_id = p_partner and stock_id = p_stock and kind = 'use'
    ) then raise exception 'STOCK_CATEGORY_IN_USE'; end if;
    difference := p_quantity - stock.quantity;
    update public.partner_private_stock
    set category = p_category, label = p_label, reference = p_reference, quantity = p_quantity, updated_at = clock_timestamp()
    where partner_id = p_partner and id = p_stock returning * into stock;
  end if;
  if difference <> 0 then
    insert into public.partner_stock_movements(partner_id, stock_id, category, label, reference, delta, quantity_after, kind, actor_id)
    values(p_partner, stock.id, stock.category, stock.label, stock.reference, difference, stock.quantity,
      case when p_expected is null then 'opening' else 'adjustment' end, p_actor);
  end if;
end;
$$;

-- The operation UUID makes a lost response safe to retry. Session and stock
-- locks serialize edits with report submission and with other stock writers.
create function public.set_partner_field_stock_usage(
  p_partner uuid, p_actor uuid, p_source text, p_visit uuid, p_session uuid, p_stock uuid,
  p_quantity integer, p_expected integer, p_operation uuid
) returns void language plpgsql security invoker set search_path = '' as $$
declare field_session public.partner_field_sessions;
declare stock public.partner_private_stock;
declare previous public.partner_stock_movements;
declare used integer;
declare change integer;
begin
  if p_quantity is null or p_quantity not between 0 and 1000000 or p_expected is null or p_expected not between 0 and 1000000
    or p_operation is null then raise exception 'STOCK_INVALID_QUANTITY'; end if;
  field_session := private.lock_partner_field_session(p_partner, p_actor, p_session);
  if not coalesce(
    (p_source = 'private' and field_session.private_visit_id = p_visit)
    or (p_source = 'sanispa' and field_session.diagnostic_id = p_visit), false
  ) then raise exception 'FIELD_NOT_FOUND'; end if;

  select * into previous from public.partner_stock_movements where partner_id = p_partner and id = p_operation;
  if found then
    if (previous.field_session_id, previous.stock_id, previous.usage_quantity, previous.usage_quantity + previous.delta)
      is not distinct from (p_session, p_stock, p_quantity, p_expected) then return; end if;
    raise exception 'STOCK_CHANGED';
  end if;
  if field_session.submitted_at is not null then raise exception 'FIELD_ALREADY_FINISHED'; end if;

  if p_source = 'private' then
    perform 1 from public.partner_private_visits
    where partner_id = p_partner and id = p_visit and completed_at is null and starts_at = field_session.appointment_start for update;
  else
    perform 1 from public.diagnostics d join public.partner_appointments a on a.diagnostic_id = d.id
    where d.id = p_visit and d.assigned_partner_id = p_partner and d.archived_at is null and d.status not in ('CLOSED','terminé')
      and a.partner_id = p_partner and a.starts_at = field_session.appointment_start for update of d, a;
  end if;
  if not found then raise exception 'FIELD_ALREADY_FINISHED'; end if;

  select * into stock from public.partner_private_stock
  where partner_id = p_partner and id = p_stock for update;
  if not found then raise exception 'STOCK_NOT_FOUND'; end if;
  select coalesce(-sum(delta), 0)::integer into used from public.partner_stock_movements
  where partner_id = p_partner and field_source = p_source and field_visit_id = p_visit and field_session_id = p_session and stock_id = p_stock;
  if used = p_quantity then return; end if;
  if used <> p_expected then raise exception 'STOCK_USAGE_CHANGED'; end if;
  change := used - p_quantity;
  if stock.category <> 'piece' then raise exception 'STOCK_NOT_FOUND'; end if;
  if stock.quantity + change < 0 then raise exception 'STOCK_INSUFFICIENT'; end if;
  if stock.quantity + change > 1000000 then raise exception 'STOCK_INVALID_QUANTITY'; end if;

  update public.partner_private_stock set quantity = quantity + change, updated_at = clock_timestamp()
  where partner_id = p_partner and id = p_stock returning * into stock;
  insert into public.partner_stock_movements(partner_id, id, stock_id, category, label, reference, delta, quantity_after, kind,
    actor_id, field_session_id, field_source, field_visit_id, usage_quantity)
  values(p_partner, p_operation, p_stock, stock.category, stock.label, stock.reference, change, stock.quantity,
    case when change < 0 then 'use' else 'return' end, p_actor, p_session, p_source, p_visit, p_quantity);
end;
$$;

create function public.get_partner_field_stock_usage(p_partner uuid, p_source text, p_visit uuid)
returns table(session_id uuid, stock_id uuid, label text, reference text, used integer, available integer)
language sql stable security invoker set search_path = '' as $$
  select m.field_session_id, m.stock_id, s.label, s.reference, -sum(m.delta)::integer, s.quantity
  from public.partner_stock_movements m join public.partner_private_stock s on s.partner_id = m.partner_id and s.id = m.stock_id
  where m.partner_id = p_partner and m.field_source = p_source and m.field_visit_id = p_visit and m.field_session_id is not null
  group by m.field_session_id, m.stock_id, s.label, s.reference, s.quantity
  having sum(m.delta) < 0
  order by s.label, m.stock_id, m.field_session_id;
$$;

revoke all on function public.save_partner_inventory_item(uuid,uuid,uuid,text,text,text,integer,timestamptz),
  public.set_partner_field_stock_usage(uuid,uuid,text,uuid,uuid,uuid,integer,integer,uuid),
  public.get_partner_field_stock_usage(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.save_partner_inventory_item(uuid,uuid,uuid,text,text,text,integer,timestamptz),
  public.set_partner_field_stock_usage(uuid,uuid,text,uuid,uuid,uuid,integer,integer,uuid),
  public.get_partner_field_stock_usage(uuid,text,uuid) to service_role;

create or replace function public.import_partner_stock(p_partner uuid, p_actor uuid, p_rows jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  imported integer;
begin
  perform 1 from public.partners p
  join public.partner_users u on u.partner_id = p.id
  where p.id = p_partner and p.active and p.verification_status <> 'pending' and u.user_id = p_actor and u.active
  for share of p, u;
  if not found then raise exception 'PARTNER_REQUIRED'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 5000 then
    raise exception 'INVALID_STOCK_IMPORT';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('partner-stock-import:' || p_partner::text, 0));

  with input as (
    select item->>'category' as category, item->>'label' as label, item->>'reference' as reference,
      (item->>'quantity')::integer as quantity, line
    from jsonb_array_elements(p_rows) with ordinality as rows(item, line)
  ), unique_rows as (
    select distinct on (category, lower(reference), case when reference = '' then lower(label) else '' end)
      category, label, reference, quantity
    from input
    order by category, lower(reference), case when reference = '' then lower(label) else '' end, line
  ), inserted as (
    insert into public.partner_private_stock(partner_id, id, category, label, reference, quantity)
    select p_partner, gen_random_uuid(), r.category, r.label, r.reference, r.quantity
    from unique_rows r
    where not exists (
      select 1 from public.partner_private_stock s
      where s.partner_id = p_partner and s.category = r.category and lower(btrim(s.reference)) = lower(r.reference)
        and (r.reference <> '' or lower(btrim(s.label)) = lower(r.label))
    )
    returning id, category, label, reference, quantity
  ), logged as (
    insert into public.partner_stock_movements (partner_id, stock_id, category, label, reference, delta, quantity_after, kind, actor_id)
    select p_partner, id, category, label, reference, quantity, quantity, 'import', p_actor
    from inserted where quantity > 0
  )
  select count(*) into imported from inserted;
  return imported;
end;
$$;

revoke all on function public.import_partner_stock(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.import_partner_stock(uuid, uuid, jsonb) to service_role;
