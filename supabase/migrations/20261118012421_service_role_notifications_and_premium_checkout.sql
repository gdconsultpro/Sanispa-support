begin;
-- Keep auth.users private. Resolve verified recipient addresses through the server Auth API.
create or replace function public.submit_intervention_report(p_id uuid,p_diagnostic uuid,p_partner uuid,p_actor uuid,p_performed timestamptz,p_findings text,p_actions text,p_next text,p_on_site boolean) returns uuid
language plpgsql security invoker set search_path='' as $$
declare d public.diagnostics; r public.intervention_reports; k text;
begin
 select * into d from public.diagnostics where id=p_diagnostic for update;
 if d.id is null or d.assigned_partner_id is distinct from p_partner or d.archived_at is not null
 or not exists(select 1 from public.partner_users u join public.partners p on p.id=u.partner_id where u.partner_id=p_partner and u.user_id=p_actor and u.active and p.active) then raise exception 'ASSIGNED_PARTNER_REQUIRED';end if;
 select * into r from public.intervention_reports where id=p_id;
 if r.id is not null then
  if r.diagnostic_id=d.id and r.partner_id=p_partner and r.author_id=p_actor and r.performed_at=p_performed and r.findings=p_findings and r.actions=p_actions and r.next_steps=p_next then return r.id;end if;
  raise exception 'REPORT_CONFLICT';
 end if;
 if d.user_id is null then raise exception 'CLIENT_ACCOUNT_REQUIRED';end if;
 if d.status in ('CLOSED','terminé') then raise exception 'CASE_CLOSED';end if;
 if not exists(select 1 from public.partner_appointments where diagnostic_id=d.id and partner_id=p_partner and starts_at<=p_performed+interval '30 minutes' and ends_at>=p_performed-interval '12 hours') then raise exception 'APPOINTMENT_REQUIRED';end if;
 if p_on_site is distinct from true or p_performed is null or p_performed>now()+interval '5 minutes' or p_performed<d.created_at then raise exception 'ON_SITE_REPORT_REQUIRED';end if;
 insert into public.intervention_reports(id,diagnostic_id,partner_id,author_id,performed_at,findings,actions,next_steps)
 values(p_id,d.id,p_partner,p_actor,p_performed,p_findings,p_actions,p_next);
 update public.diagnostics set intervened_at=p_performed,intervened_partner_id=p_partner,
 intervened_company_name=(select company_name from public.partners where id=p_partner) where id=d.id;
 k:='report:'||p_id;
 insert into public.notification_jobs(key,kind,payload) values(k,'client_report',jsonb_build_object('diagnosticId',d.id,'reportId',p_id,'userId',d.user_id,'notificationKey',k));
 insert into public.diagnostic_activity(diagnostic_id,actor,status,event_type,metadata) values(d.id,p_actor::text,d.status,'intervention_report_submitted',jsonb_build_object('report_id',p_id));
 return p_id;
end;$$;

create or replace function public.queue_client_review_reminders() returns int language plpgsql security invoker set search_path='' as $$
declare n int;
begin
 insert into public.notification_jobs(key,kind,payload)
 select 'review-reminder:'||r.id,'client_review_reminder',jsonb_build_object('diagnosticId',r.diagnostic_id,'reportId',r.id,'userId',d.user_id,'notificationKey','review-reminder:'||r.id)
 from public.intervention_reports r join public.diagnostics d on d.id=r.diagnostic_id
 where d.user_id is not null and r.client_validated_at is null and r.submitted_at<now()-interval '3 days' and d.archived_at is null
 on conflict(key) do nothing;
 get diagnostics n=row_count; return n;
end;$$;

create or replace function public.queue_premium_care_reminders() returns int language plpgsql security invoker set search_path='' as $$
declare n int;
begin
 insert into public.notification_jobs(key,kind,payload)
 select 'care:'||r.id||':'||r.version,'premium_care',jsonb_build_object('reminderId',r.id,'version',r.version,'userId',r.user_id,'title',r.title,'notificationKey','care:'||r.id||':'||r.version)
 from public.care_reminders r where r.completed_at is null and r.due_at<=now() and public.customer_has_premium(r.user_id)
 on conflict(key) do nothing;
 get diagnostics n=row_count;return n;
end;$$;

create or replace function public.prepare_customer_subscription(p_user uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.customer_subscription_checkouts;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,901));
 -- The HTTP entry verifies the confirmed session via Auth; this RPC is service-only.
 if p_user is null then raise exception 'CONFIRMED_CUSTOMER_REQUIRED';end if;
 if exists(select 1 from public.customer_subscriptions where user_id=p_user and (status in ('active','past_due','review') or paid_until>now())) then raise exception 'SUBSCRIPTION_EXISTS';end if;
 select * into c from public.customer_subscription_checkouts where user_id=p_user and state='pending' for update;
 if c.id is null then insert into public.customer_subscription_checkouts(user_id) values(p_user) returning * into c;end if;
 return to_jsonb(c);
end;$$;
commit;
