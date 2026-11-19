-- Only the API supplies the confirmed Auth identity. Neither public visitors nor
-- authenticated clients can select a company, another user or a privilege level.
create function public.partner_onboarding_status(p_user uuid,p_email text) returns jsonb
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
  return jsonb_build_object('registered',false,'candidate',jsonb_build_object('company_name',company.company_name,'city',company.city));
 end if;
 return jsonb_build_object('registered',false,'candidate',null);
end;$$;
create function public.register_partner_self(p_user uuid,p_email text,p_profile jsonb) returns uuid
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
 select count(*) into matches from public.partners where lower(btrim(email))=lower(btrim(p_email));
 if matches>1 then raise exception 'PARTNER_EMAIL_AMBIGUOUS';end if;
 select * into company from public.partners where lower(btrim(email))=lower(btrim(p_email)) for update;
 if company.id is not null then
  -- A confirmed e-mail can claim only the unused company already addressed to
  -- that exact e-mail by SANISPA. Never take over an existing/inactive member.
  if mode<>'claim' then raise exception 'EXISTING_COMPANY_CONFIRMATION_REQUIRED';end if;
  if not company.active or exists(select 1 from public.partner_users where partner_id=company.id) then raise exception 'PARTNER_ACCESS_INACTIVE';end if;
  company_id:=company.id;
 else
  if mode<>'create' then raise exception 'COMPANY_NOT_FOUND';end if;
  if length(btrim(coalesce(p_profile->>'companyName',''))) not between 2 and 150
   or length(btrim(coalesce(p_profile->>'contactName',''))) not between 2 and 150
   or length(btrim(coalesce(p_profile->>'phone',''))) not between 6 and 30
   or coalesce(p_profile->>'postalCode','') !~ '^[0-9]{5}$'
   or length(btrim(coalesce(p_profile->>'city',''))) not between 1 and 120
   or length(coalesce(p_profile->>'address',''))>300
   or jsonb_typeof(p_profile->'departments') is distinct from 'array' then raise exception 'INVALID_REGISTRATION';end if;
  select array_agg(distinct upper(btrim(v))) into departments from jsonb_array_elements_text(p_profile->'departments') v;
  if coalesce(cardinality(departments),0) not between 1 and 101 or exists(select 1 from unnest(departments) d where d !~ '^([0-9]{2,3}|2[AB])$') then raise exception 'INVALID_DEPARTMENTS';end if;
  insert into public.partners(company_name,contact_name,email,phone,address,postal_code,city,active)
  values(btrim(p_profile->>'companyName'),btrim(p_profile->>'contactName'),lower(btrim(p_email)),btrim(p_profile->>'phone'),nullif(btrim(p_profile->>'address'),''),p_profile->>'postalCode',btrim(p_profile->>'city'),true) returning id into company_id;
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
