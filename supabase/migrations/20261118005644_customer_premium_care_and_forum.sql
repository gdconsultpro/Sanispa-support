begin;
create function private.mark_premium_water_request() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.request_type='WATER_ANALYSIS' then new.payment_status:='subscription';end if;
 return new;
end;$$;
revoke all on function private.mark_premium_water_request() from public,anon,authenticated;
grant execute on function private.mark_premium_water_request() to service_role;
create trigger premium_water_request before insert on public.diagnostics for each row execute function private.mark_premium_water_request();
create table public.customer_subscriptions (
 user_id uuid primary key references auth.users(id), status text not null check(status in ('active','past_due','canceled','review')),
 stripe_subscription_id text not null unique,stripe_customer_id text not null,paid_until timestamptz not null,event_created bigint not null
);
create table public.customer_subscription_checkouts (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),amount int not null default 999 check(amount=999),
 stripe_session_id text unique,state text not null default 'pending' check(state in ('pending','complete','expired')),created_at timestamptz not null default now()
);
create unique index one_pending_customer_subscription on public.customer_subscription_checkouts(user_id) where state='pending';
create function public.customer_has_premium(p_user uuid) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.customer_subscriptions where user_id=p_user and status in ('active','canceled') and paid_until>now());
$$;
create function public.prepare_customer_subscription(p_user uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.customer_subscription_checkouts;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,901));
 if not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null) then raise exception 'CONFIRMED_CUSTOMER_REQUIRED';end if;
 if exists(select 1 from public.customer_subscriptions where user_id=p_user and (status in ('active','past_due','review') or paid_until>now())) then raise exception 'SUBSCRIPTION_EXISTS';end if;
 select * into c from public.customer_subscription_checkouts where user_id=p_user and state='pending' for update;
 if c.id is null then insert into public.customer_subscription_checkouts(user_id) values(p_user) returning * into c;end if;
 return to_jsonb(c);
end;$$;
create function public.record_customer_subscription(p_checkout uuid,p_user uuid,p_subscription text,p_customer text,p_until timestamptz,p_event bigint) returns void
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,901));
 if not exists(select 1 from public.customer_subscription_checkouts where id=p_checkout and user_id=p_user and amount=999 and stripe_session_id is not null and state in ('pending','complete')) then raise exception 'CHECKOUT_NOT_FOUND';end if;
 insert into public.customer_subscriptions values(p_user,'active',p_subscription,p_customer,p_until,p_event)
 on conflict(user_id) do update set status=case when public.customer_subscriptions.status='review' then 'review' else 'active' end,
 stripe_subscription_id=excluded.stripe_subscription_id,stripe_customer_id=excluded.stripe_customer_id,paid_until=excluded.paid_until,event_created=excluded.event_created
 where public.customer_subscriptions.event_created<=excluded.event_created;
 update public.customer_subscription_checkouts set state='complete' where id=p_checkout;
end;$$;

create table public.care_journal (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),spa_id uuid not null references public.customer_spas(id),
 kind text not null check(kind in ('vidange','filtre','consommables','observation')),performed_at timestamptz not null,note text not null check(length(note) between 1 and 2000),created_at timestamptz not null default now()
);
create table public.care_reminders (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),spa_id uuid not null references public.customer_spas(id),
 kind text not null check(kind in ('vidange','filtre','consommables')),title text not null check(length(title) between 3 and 200),
 due_at timestamptz not null,repeat_days int check(repeat_days between 1 and 3650),completed_at timestamptz,version int not null default 1,created_at timestamptz not null default now()
);
create table public.water_readings (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),spa_id uuid not null references public.customer_spas(id),measured_at timestamptz not null,
 volume_litres numeric check(volume_litres>0 and volume_litres<=100000),temperature numeric check(temperature between 0 and 60),ph numeric check(ph between 0 and 14),
 tac numeric check(tac between 0 and 1000),disinfectant text not null check(disinfectant in ('chlore','brome','autre','aucun','inconnu')),
 disinfectant_value numeric check(disinfectant_value between 0 and 100),product text not null default '' check(length(product)<=300),note text not null default '' check(length(note)<=2000),created_at timestamptz not null default now()
);
create function public.check_premium_spa_owner() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if not public.customer_has_premium(new.user_id) then raise exception 'PREMIUM_REQUIRED';end if;
 if not exists(select 1 from public.customer_spas where id=new.spa_id and user_id=new.user_id) then raise exception 'SPA_OWNER_REQUIRED';end if;
 return new;
end;$$;
create trigger care_journal_owner before insert or update on public.care_journal for each row execute function public.check_premium_spa_owner();
create trigger care_reminders_owner before insert or update on public.care_reminders for each row execute function public.check_premium_spa_owner();
create trigger water_readings_owner before insert or update on public.water_readings for each row execute function public.check_premium_spa_owner();
create function public.complete_care_reminder(p_id uuid,p_user uuid,p_version int) returns void language plpgsql security invoker set search_path='' as $$
declare r public.care_reminders;
begin
 select * into r from public.care_reminders where id=p_id and user_id=p_user for update;
 if r.id is null or not public.customer_has_premium(p_user) then raise exception 'PREMIUM_REMINDER_REQUIRED';end if;
 if r.completed_at is not null then return;end if;
 if r.version is distinct from p_version then raise exception 'REMINDER_CONFLICT';end if;
 insert into public.care_journal(user_id,spa_id,kind,performed_at,note) values(p_user,r.spa_id,r.kind,now(),r.title);
 update public.care_reminders set completed_at=case when repeat_days is null then now() else null end,
 due_at=case when repeat_days is null then due_at else now()+make_interval(days=>repeat_days) end,version=version+1 where id=r.id;
end;$$;

create table public.premium_ai_threads (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),topic text not null check(topic in ('eau','panne','entretien','notices')),created_at timestamptz not null default now()
);
create table public.premium_ai_requests (
 id uuid primary key,user_id uuid not null references auth.users(id),thread_id uuid not null references public.premium_ai_threads(id),
 message text not null check(length(message) between 1 and 3000),context_key text not null default '' check(length(context_key)<=100),answer text,model text,input_tokens int check(input_tokens>=0),output_tokens int check(output_tokens>=0),
 state text not null default 'pending' check(state in ('pending','complete','failed','uncertain')),created_at timestamptz not null default now()
);
create function public.begin_premium_ai_request(p_id uuid,p_user uuid,p_thread uuid,p_message text,p_context text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.premium_ai_requests;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,902));
 if not public.customer_has_premium(p_user) then raise exception 'PREMIUM_REQUIRED';end if;
 if not exists(select 1 from public.premium_ai_threads where id=p_thread and user_id=p_user) then raise exception 'THREAD_OWNER_REQUIRED';end if;
 select * into r from public.premium_ai_requests where id=p_id;
 if r.id is not null then
  if r.user_id<>p_user or r.thread_id<>p_thread or r.message<>p_message or r.context_key is distinct from p_context then raise exception 'AI_REQUEST_CONFLICT';end if;
  return jsonb_build_object('fresh',false,'state',r.state,'answer',r.answer);
 end if;
 if exists(select 1 from public.premium_ai_requests where user_id=p_user and state='pending' and created_at>now()-interval '2 minutes') then raise exception 'AI_REQUEST_PENDING';end if;
 insert into public.premium_ai_requests(id,user_id,thread_id,message,context_key) values(p_id,p_user,p_thread,p_message,p_context);
 return jsonb_build_object('fresh',true,'state','pending');
end;$$;

create table public.spa_manuals (
 id uuid primary key default gen_random_uuid(),brand text not null,model text not null,title text not null,source_url text not null check(source_url like 'https://%'),
 source_kind text not null default 'support' check(source_kind in ('support','manual')),verified_at timestamptz not null default now(),active boolean not null default true
);
create table public.forum_posts (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),parent_id uuid references public.forum_posts(id),
 title text not null default '' check(length(title)<=150),body text not null check(length(btrim(body)) between 10 and 3000),
 state text not null default 'pending' check(state in ('pending','approved','rejected')),solicitation_flag boolean not null default false,
 moderated_by uuid references auth.users(id),moderated_at timestamptz,created_at timestamptz not null default now()
);
-- Official manufacturer catalogues; support pages are explicitly distinguished from manuals.
insert into public.spa_manuals(brand,model,title,source_url,source_kind) values
 ('Balboa','TP400 / TP600','TP400 et TP600 — menus standard (anglais)','https://www.balboawater.com/wp-content/uploads/2024/12/TP600-and-TP400-USER-GUIDE_Standard-Menus_40940.pdf','manual'),
 ('Balboa','SpaTouch / TP','Catalogue des guides utilisateur Balboa','https://www.balboawater.com/support/pdf-user-guides/','support'),
 ('Gecko','in.k300 / in.k600 / in.k330','Documentation fabricant des claviers LCD — français disponible','https://www.geckodocs.com/lcdkeypads','support'),
 ('SpaNET','SV Mini 1 / SV Mini 2','SV Mini — guide utilisateur (anglais)','https://www.spanet.com.au/wp-content/uploads/2024/06/SV-Mini-User-Manual-1704.pdf','manual'),
 ('SpaNET','SV / XS','Catalogue des notices SpaNET','https://www.spanet.com.au/support-hub/','support'),
 ('Joyonway','PB563','PB563 — téléchargement officiel du fabricant','https://www.joyonway.com/EN/downinfo.aspx?CateId=198&Id=17','support');
create function public.check_forum_client() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if not public.customer_has_premium(new.user_id) then raise exception 'PREMIUM_REQUIRED';end if;
 if exists(select 1 from public.partner_users u join public.partners p on p.id=u.partner_id where u.user_id=new.user_id and u.active and p.active) then raise exception 'PARTNER_FORUM_FORBIDDEN';end if;
 if new.parent_id is not null and not exists(select 1 from public.forum_posts where id=new.parent_id and parent_id is null and state='approved') then raise exception 'FORUM_TOPIC_UNAVAILABLE';end if;
 return new;
end;$$;
create trigger forum_client before insert on public.forum_posts for each row execute function public.check_forum_client();

create function public.queue_premium_care_reminders() returns int language plpgsql security invoker set search_path='' as $$
declare n int;
begin
 insert into public.notification_jobs(key,kind,payload)
 select 'care:'||r.id||':'||r.version,'premium_care',jsonb_build_object('reminderId',r.id,'version',r.version,'userId',r.user_id,'email',u.email,'title',r.title,'notificationKey','care:'||r.id||':'||r.version)
 from public.care_reminders r join auth.users u on u.id=r.user_id where r.completed_at is null and r.due_at<=now() and public.customer_has_premium(r.user_id)
 on conflict(key) do nothing;
 get diagnostics n=row_count;return n;
end;$$;

do $$declare t text;begin
 foreach t in array array['customer_subscriptions','customer_subscription_checkouts','care_journal','care_reminders','water_readings','premium_ai_threads','premium_ai_requests','spa_manuals','forum_posts'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end;$$;
create index care_journal_user on public.care_journal(user_id,performed_at desc);
create index care_journal_spa on public.care_journal(spa_id);
create index care_reminders_user on public.care_reminders(user_id,due_at);
create index care_reminders_spa on public.care_reminders(spa_id);
create index water_readings_user on public.water_readings(user_id,measured_at desc);
create index water_readings_spa on public.water_readings(spa_id);
create index ai_threads_user on public.premium_ai_threads(user_id,created_at desc);
create index ai_requests_thread on public.premium_ai_requests(thread_id,created_at desc);
create index ai_requests_user on public.premium_ai_requests(user_id,state,created_at desc);
create index forum_posts_parent on public.forum_posts(parent_id,state,created_at);
create index forum_posts_user on public.forum_posts(user_id,created_at desc);
create index forum_posts_moderator on public.forum_posts(moderated_by);
create index ai_requests_created on public.premium_ai_requests(created_at);
create function public.premium_admin_summary(p_actor uuid,p_since timestamptz) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.admin_users where user_id=p_actor and active) then raise exception 'ADMIN_REQUIRED';end if;
 return jsonb_build_object('active_subscriptions',(select count(*) from public.customer_subscriptions where status in ('active','canceled') and paid_until>now()),
 'requests',(select count(*) from public.premium_ai_requests where created_at>=p_since),
 'unconfirmed_usage',(select count(*) from public.premium_ai_requests where created_at>=p_since and (state<>'complete' or input_tokens is null or output_tokens is null)),
 'models',coalesce((select jsonb_agg(x) from (select model,count(*) requests,coalesce(sum(input_tokens),0) input_tokens,coalesce(sum(output_tokens),0) output_tokens
  from public.premium_ai_requests where created_at>=p_since and state='complete' group by model) x),'[]'::jsonb));
end;$$;
revoke all on function public.premium_admin_summary(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.premium_admin_summary(uuid,timestamptz) to service_role;
create or replace function public.claim_notifications(p_key text default null) returns setof public.notification_jobs
language sql security invoker set search_path='' as $$
 update public.notification_jobs set locked_until=now()+interval '2 minutes',attempts=attempts+1,
 first_delivery_attempt_at=case when kind in ('partner','partner_accepted','client_report','client_review_reminder','premium_care') then coalesce(first_delivery_attempt_at,case when attempts>0 then created_at else now() end) else first_delivery_attempt_at end
 where id in (select id from public.notification_jobs where state='pending' and (locked_until is null or locked_until<now())
 and (p_key is null or key like p_key||'%') order by created_at limit 10 for update skip locked) returning *;
$$;
revoke all on function public.customer_has_premium(uuid),public.prepare_customer_subscription(uuid),public.record_customer_subscription(uuid,uuid,text,text,timestamptz,bigint),public.check_premium_spa_owner(),public.complete_care_reminder(uuid,uuid,int),public.begin_premium_ai_request(uuid,uuid,uuid,text,text),public.check_forum_client(),public.queue_premium_care_reminders() from public,anon,authenticated;
grant execute on function public.customer_has_premium(uuid),public.prepare_customer_subscription(uuid),public.record_customer_subscription(uuid,uuid,text,text,timestamptz,bigint),public.check_premium_spa_owner(),public.complete_care_reminder(uuid,uuid,int),public.begin_premium_ai_request(uuid,uuid,uuid,text,text),public.check_forum_client(),public.queue_premium_care_reminders() to service_role;
commit;
