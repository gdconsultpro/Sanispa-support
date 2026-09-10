begin;
alter table public.water_assistance_sessions add column if not exists user_id uuid references auth.users(id) on delete set null;
update public.water_assistance_sessions w set user_id=d.user_id from public.diagnostics d where w.diagnostic_id=d.id and w.user_id is null;
create table if not exists public.stripe_events(id text primary key,created_at timestamptz not null default now());
alter table public.stripe_events enable row level security;
create or replace function public.prepare_water_checkout(p_id uuid,p_user uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare d diagnostics; w water_assistance_sessions; c customers;
begin
 select * into d from diagnostics where id=p_id and user_id=p_user for update;
 if d.id is null or d.payment_plan is distinct from 'water' then raise exception 'NOT_FOUND';end if;
 select * into w from water_assistance_sessions where user_id=p_user and status='paid' and expires_at>now() order by created_at desc limit 1;
 if w.id is not null then return to_jsonb(w);end if;
 select * into w from water_assistance_sessions where diagnostic_id=p_id and status='pending' order by created_at desc limit 1;
 if w.id is null then
 select * into c from customers where id=d.customer_id;
 insert into water_assistance_sessions(diagnostic_id,user_id,customer_email,customer_name,resume_token,status,expires_at)
 values(p_id,p_user,c.email,c.name,replace(gen_random_uuid()::text,'-',''),'pending',now()+interval '1 day') returning * into w;
 end if;
 return to_jsonb(w);
end; $$;
create or replace function public.apply_water_payment(p_event text,p_session text,p_water uuid,p_diagnostic uuid,p_intent text,p_amount int,p_currency text,p_paid_at timestamptz,p_days int,p_job jsonb) returns boolean
language plpgsql security definer set search_path=public as $$
declare w water_assistance_sessions;
begin
 select * into w from water_assistance_sessions where id=p_water and diagnostic_id=p_diagnostic for update;
 if w.id is null then raise exception 'SESSION_NOT_FOUND';end if;
 if exists(select 1 from stripe_events where id=p_event) then return false;end if;
 if w.status in ('paid','refunded') then insert into stripe_events(id) values(p_event) on conflict do nothing;return false;end if;
 if w.stripe_checkout_session_id is not null and w.stripe_checkout_session_id<>p_session then raise exception 'SESSION_MISMATCH';end if;
 update water_assistance_sessions set status='paid',current_step='assistant',paid_at=p_paid_at,expires_at=p_paid_at+make_interval(days=>p_days),stripe_checkout_session_id=p_session,stripe_payment_intent_id=p_intent,updated_at=now() where id=w.id;
 update payments set status='paid',amount=p_amount,currency=p_currency,stripe_payment_intent_id=p_intent where stripe_session_id=p_session;
 if not found then insert into payments(diagnostic_id,stripe_session_id,stripe_payment_intent_id,amount,currency,status,plan) values(p_diagnostic,p_session,p_intent,p_amount,p_currency,'paid','water');end if;
 update diagnostics set payment_status='paid',status='WATER_ANALYSIS' where id=p_diagnostic;
 insert into stripe_events(id) values(p_event) on conflict do nothing;
 insert into notification_jobs(key,kind,payload) values('water:'||w.id,'water',p_job) on conflict(key) do nothing;
 return true;
end; $$;
create or replace function public.apply_partner_payment(p_session text,p_purchase uuid,p_partner uuid,p_diagnostic uuid,p_intent text,p_paid_at timestamptz) returns void
language plpgsql security definer set search_path=public as $$
declare d diagnostics; purchase lead_purchases;
begin
 select * into d from diagnostics where id=p_diagnostic for update;
 select * into purchase from lead_purchases where id=p_purchase and partner_id=p_partner and request_id=p_diagnostic for update;
 if d.id is null or purchase.id is null or (d.assigned_partner_id is not null and d.assigned_partner_id<>p_partner) then raise exception 'PARTNER_ASSIGNMENT_CONFLICT';end if;
 if purchase.status='paid' then return;end if;
 if purchase.stripe_checkout_session_id is distinct from p_session then raise exception 'SESSION_MISMATCH';end if;
 update lead_purchases set status='paid',stripe_payment_intent_id=p_intent,paid_at=p_paid_at,locked_until=null where id=p_purchase;
 update diagnostics set assigned_partner_id=p_partner,assigned_at=p_paid_at,lead_locked_until=null,status='ASSIGNED' where id=p_diagnostic;
end; $$;
revoke all on function public.prepare_water_checkout(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_water_checkout(uuid,uuid) to service_role;
revoke all on function public.apply_water_payment(text,text,uuid,uuid,text,int,text,timestamptz,int,jsonb) from public,anon,authenticated;
grant execute on function public.apply_water_payment(text,text,uuid,uuid,text,int,text,timestamptz,int,jsonb) to service_role;
revoke all on function public.apply_partner_payment(text,uuid,uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.apply_partner_payment(text,uuid,uuid,uuid,text,timestamptz) to service_role;
commit;
