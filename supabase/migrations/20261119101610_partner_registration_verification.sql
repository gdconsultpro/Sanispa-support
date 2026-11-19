-- Existing companies retain their current eligibility. Public registrations,
-- including claims of an unused company, require a separate administrator review.
alter table public.partners
 add column siret text check(siret is null or siret ~ '^[0-9]{14}$'),
 add column verification_status text not null default 'existing' check(verification_status in ('existing','pending','verified')),
 add column verified_at timestamptz,
 add column verified_by uuid references auth.users(id);
-- Only the API supplies the confirmed Auth identity. Neither public visitors nor
-- authenticated clients can select a company, another user or a privilege level.
create or replace function public.partner_onboarding_status(p_user uuid,p_email text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare member public.partner_users; company public.partners; matches integer;
begin
 if p_user is null or p_email is null then raise exception 'USER_REQUIRED';end if;
 if (select count(*) from public.partner_users where user_id=p_user)>1 then raise exception 'MULTIPLE_COMPANIES';end if;
 select * into member from public.partner_users where user_id=p_user;
 if member.id is not null then
  select * into company from public.partners where id=member.partner_id;
  if not member.active or not company.active then return jsonb_build_object('blocked',true,'message','Votre accès partenaire est désactivé. Contactez SANISPA.');end if;
  return jsonb_build_object('registered',true,'partner',jsonb_build_object('id',company.id,'company_name',company.company_name));
 end if;
 select count(*) into matches from public.partners where lower(btrim(email))=lower(btrim(p_email));
 if matches>1 then return jsonb_build_object('blocked',true,'message','Plusieurs entreprises utilisent cette adresse. Contactez SANISPA pour vérifier le rattachement.');end if;
 select * into company from public.partners where lower(btrim(email))=lower(btrim(p_email));
 if company.id is not null then
  if not company.active or exists(select 1 from public.partner_users where partner_id=company.id) then
   return jsonb_build_object('blocked',true,'message','Cette entreprise dispose déjà d’un accès ou est désactivée. Contactez SANISPA pour vérifier votre rattachement.');
  end if;
  return jsonb_build_object('registered',false,'candidate',jsonb_build_object('company_name',company.company_name,'city',company.city,'contact_name',company.contact_name,'phone',company.phone,'address',company.address,'postal_code',company.postal_code,'siret',company.siret,'departments',(select coalesce(jsonb_agg(department),'[]'::jsonb) from public.partner_departments where partner_id=company.id)));
 end if;
 return jsonb_build_object('registered',false,'candidate',null);
end;$$;
create or replace function public.register_partner_self(p_user uuid,p_email text,p_profile jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare member public.partner_users; company public.partners; company_id uuid; matches integer;
 mode text:=p_profile->>'mode';departments text[];
begin
 if p_user is null or p_email is null or length(p_email) not between 3 and 254 then raise exception 'USER_REQUIRED';end if;
 if mode is null or mode not in ('create','claim') then raise exception 'INVALID_REGISTRATION';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,31415));
 perform pg_advisory_xact_lock(hashtextextended(lower(btrim(p_email)),27182));
 if (select count(*) from public.partner_users where user_id=p_user)>1 then raise exception 'MULTIPLE_COMPANIES';end if;
 select * into member from public.partner_users where user_id=p_user for update;
 if member.id is not null then
  if not member.active or not exists(select 1 from public.partners where id=member.partner_id and active) then raise exception 'PARTNER_ACCESS_INACTIVE';end if;
  return member.partner_id;
 end if;
  if length(btrim(coalesce(p_profile->>'companyName',''))) not between 2 and 150
   or length(btrim(coalesce(p_profile->>'contactName',''))) not between 2 and 150
   or length(btrim(coalesce(p_profile->>'phone',''))) not between 6 and 30
   or coalesce(p_profile->>'postalCode','') !~ '^[0-9]{5}$'
   or length(btrim(coalesce(p_profile->>'city',''))) not between 1 and 120
   or length(btrim(coalesce(p_profile->>'address',''))) not between 3 and 300
   or coalesce(p_profile->>'siret','') !~ '^[0-9]{14}$'
   or jsonb_typeof(p_profile->'departments') is distinct from 'array' then raise exception 'INVALID_REGISTRATION';end if;
  select array_agg(distinct upper(btrim(v))) into departments from jsonb_array_elements_text(p_profile->'departments') v;
  if coalesce(cardinality(departments),0) not between 1 and 101 or exists(select 1 from unnest(departments) d where d !~ '^([0-9]{2,3}|2[AB])$') then raise exception 'INVALID_DEPARTMENTS';end if;
 select count(*) into matches from public.partners where lower(btrim(email))=lower(btrim(p_email));
 if matches>1 then raise exception 'PARTNER_EMAIL_AMBIGUOUS';end if;
 select * into company from public.partners where lower(btrim(email))=lower(btrim(p_email)) for update;
 if company.id is not null then
  -- A confirmed e-mail can claim only the unused company already addressed to
  -- that exact e-mail by SANISPA. Never take over an existing/inactive member.
  if mode<>'claim' then raise exception 'EXISTING_COMPANY_CONFIRMATION_REQUIRED';end if;
  if not company.active or exists(select 1 from public.partner_users where partner_id=company.id) then raise exception 'PARTNER_ACCESS_INACTIVE';end if;
  company_id:=company.id;
  update public.partners set company_name=btrim(p_profile->>'companyName'),contact_name=btrim(p_profile->>'contactName'),phone=btrim(p_profile->>'phone'),address=btrim(p_profile->>'address'),postal_code=p_profile->>'postalCode',city=btrim(p_profile->>'city'),siret=p_profile->>'siret',verification_status='pending',verified_at=null,verified_by=null where id=company_id;
  delete from public.partner_departments where partner_id=company_id;
  insert into public.partner_departments(partner_id,department) select company_id,d from unnest(departments) d;
 else
  if mode<>'create' then raise exception 'COMPANY_NOT_FOUND';end if;
  insert into public.partners(company_name,contact_name,email,phone,address,postal_code,city,active,siret,verification_status)
  values(btrim(p_profile->>'companyName'),btrim(p_profile->>'contactName'),lower(btrim(p_email)),btrim(p_profile->>'phone'),nullif(btrim(p_profile->>'address'),''),p_profile->>'postalCode',btrim(p_profile->>'city'),true,p_profile->>'siret','pending') returning id into company_id;
  insert into public.partner_departments(partner_id,department) select company_id,d from unnest(departments) d;
 end if;
 insert into public.partner_users(partner_id,user_id,role,active,contact_name,created_by)
 values(company_id,p_user,'owner',true,coalesce(nullif(btrim(p_profile->>'contactName'),''),company.contact_name),p_user);
 insert into public.partner_access_history(partner_id,user_id,actor,action) values(company_id,p_user,p_user,'linked');
 -- Registration never releases a diagnostic, changes an assignment, accepts
 -- the charter or creates any subscription or payment.
 return company_id;
end;$$;
revoke all on function public.partner_onboarding_status(uuid,text),public.register_partner_self(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.partner_onboarding_status(uuid,text),public.register_partner_self(uuid,text,jsonb) to service_role;
grant select,insert,update on public.partners,public.partner_users,public.partner_departments to service_role;
grant delete on public.partner_departments to service_role;

create function public.verify_partner_registration(p_partner uuid,p_actor uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare p public.partners;
begin
 if not exists(select 1 from public.admin_users where user_id=p_actor and active) then raise exception 'ADMIN_REQUIRED';end if;
 select * into p from public.partners where id=p_partner for update;
 if p.id is null or not p.active or p.siret is null or p.siret !~ '^[0-9]{14}$'
 or length(btrim(coalesce(p.contact_name,'')))<2 or length(btrim(coalesce(p.phone,'')))<6
 or length(btrim(coalesce(p.address,'')))<3 or coalesce(p.postal_code,'') !~ '^[0-9]{5}$'
 or length(btrim(coalesce(p.city,'')))<1 then raise exception 'INCOMPLETE_REGISTRATION';end if;
 update public.partners set verification_status='verified',verified_at=now(),verified_by=p_actor where id=p.id;
end;$$;
revoke all on function public.verify_partner_registration(uuid,uuid) from public,anon,authenticated;
grant execute on function public.verify_partner_registration(uuid,uuid) to service_role;

create or replace function public.publish_partner_offer(p_diagnostic uuid,p_partner uuid,p_actor uuid,p_category text,p_description text,p_photos text[])
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.diagnostics; p public.partners; amount int; k text;
begin
 perform 1 from public.admin_users where user_id=p_actor and active;
 if not found then raise exception 'ADMIN_REQUIRED'; end if;
 select * into d from public.diagnostics where id=p_diagnostic for update;
 if d.id is null or d.request_type<>'TECHNICAL_REQUEST' or d.archived_at is not null
 or d.status not in ('NEW','AVAILABLE','nouvelle') or d.partner_kept_at is not null
 or d.partner_released_at is not null or d.assigned_partner_id is not null
 or exists(select 1 from public.lead_purchases where request_id=d.id and status in ('pending','paid','granted')) then raise exception 'RELEASE_UNAVAILABLE';end if;
 select x.* into p from public.partners x join public.partner_departments pd on pd.partner_id=x.id
 where x.id=p_partner and x.active and pd.department=d.department for share of x;
 if p.id is null then raise exception 'PARTNER_INELIGIBLE';end if;
 if p.verification_status='pending' then raise exception 'PARTNER_VERIFICATION_REQUIRED';end if;
 amount:=public.catalog_lead_amount(p_category);
 if amount is null or char_length(btrim(p_description)) not between 20 and 1500 or cardinality(p_photos)>5
 or exists(select 1 from unnest(p_photos) path where not exists(select 1 from public.diagnostic_photos where diagnostic_id=d.id and storage_path=path)) then raise exception 'INVALID_PREVIEW';end if;
 update public.diagnostics set offer_version=2,lead_category=p_category,lead_amount=amount,
 preview_description=p_description,preview_photo_paths=p_photos,matched_partner_ids=array[p.id],partner_released_at=now(),partner_released_by=p_actor where id=d.id;
 k:=d.id||':manual-partner:'||p.id;
 insert into public.notification_jobs(key,kind,payload) values(k,'partner',jsonb_build_object('diagnosticId',d.id,'notificationKey',k,
 'partners',jsonb_build_array(jsonb_build_object('id',p.id,'companyName',p.company_name,'contactName',p.contact_name,'email',p.email)),
 'problemType',d.problem_type,'department',d.department,'postalCode','','city','','answers','[]'::jsonb)) on conflict(key) do nothing;
 insert into public.diagnostic_activity(diagnostic_id,actor,status,event_type,metadata) values(d.id,p_actor::text,d.status,'partner_released',jsonb_build_object('partner_id',p.id,'category',p_category,'amount',amount,'currency','eur','tax_basis','TTC'));
 return jsonb_build_object('released',true,'notificationKey',k);
end;$$;
