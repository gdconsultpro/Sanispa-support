create function public.import_partner_stock(p_partner uuid, p_actor uuid, p_rows jsonb) returns integer
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
  )
  insert into public.partner_private_stock(partner_id, id, category, label, reference, quantity)
    select p_partner, gen_random_uuid(), r.category, r.label, r.reference, r.quantity
    from unique_rows r
    where not exists (
      select 1 from public.partner_private_stock s
      where s.partner_id = p_partner and s.category = r.category and lower(btrim(s.reference)) = lower(r.reference)
        and (r.reference <> '' or lower(btrim(s.label)) = lower(r.label))
    );
  get diagnostics imported = row_count;
  return imported;
end;
$$;

revoke all on function public.import_partner_stock(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.import_partner_stock(uuid, uuid, jsonb) to service_role;
