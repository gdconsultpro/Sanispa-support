-- Private media for the feasibility study. Uploads go directly to Storage so
-- videos do not transit through Vercel's request body limit or localStorage.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('moving-videos','moving-videos',false,31457280,array['video/mp4','video/quicktime','video/webm'])
on conflict(id) do update set public=false,file_size_limit=31457280,allowed_mime_types=excluded.allowed_mime_types;
alter table public.client_documents add column draft_id uuid references public.diagnostic_drafts(id) on delete set null;
create index client_documents_draft_id_idx on public.client_documents(draft_id) where draft_id is not null;
create table public.moving_media_uploads (
 id uuid primary key default gen_random_uuid(),draft_id uuid not null references public.diagnostic_drafts(id) on delete cascade,
 user_id uuid not null references auth.users(id),slot smallint not null check(slot between 0 and 2),
 storage_path text not null unique,file_name text not null check(length(file_name) between 1 and 200),
 mime_type text not null check(mime_type in ('video/mp4','video/quicktime','video/webm')),
 file_size integer not null check(file_size between 1 and 31457280),
 document_id uuid unique references public.client_documents(id) on delete cascade,created_at timestamptz not null default now(),
 unique(draft_id,slot)
);
create index moving_media_uploads_user_id_idx on public.moving_media_uploads(user_id);
alter table public.moving_media_uploads enable row level security;
revoke all on public.moving_media_uploads from public,anon,authenticated;
grant select,insert,update,delete on public.moving_media_uploads to service_role;
-- The submitted dossier and its private videos become available atomically.
create function private.attach_moving_documents() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.submitted_at is not null and old.submitted_at is null then
  update public.client_documents set diagnostic_id=new.id where draft_id=new.id and user_id=new.user_id;
 end if;
 return new;
end $$;
revoke all on function private.attach_moving_documents() from public,anon,authenticated;
create trigger attach_moving_documents after update of submitted_at on public.diagnostic_drafts for each row execute function private.attach_moving_documents();
-- Finalization locks the draft: a simultaneous submission cannot leave a
-- completed video detached from its dossier. Only the trusted API can call it.
create function public.complete_moving_media_upload(p_id uuid,p_user uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare media public.moving_media_uploads%rowtype; draft public.diagnostic_drafts%rowtype;
begin
 select * into media from public.moving_media_uploads where id=p_id and user_id=p_user;
 if not found then raise exception 'MEDIA_NOT_FOUND';end if;
 select * into draft from public.diagnostic_drafts where id=media.draft_id and user_id=p_user for update;
 if not found or draft.payload->>'problemType'<>'demenagement' then raise exception 'DRAFT_NOT_FOUND';end if;
 select * into media from public.moving_media_uploads where id=p_id and user_id=p_user for update;
 if not found then raise exception 'MEDIA_NOT_FOUND';end if;
 if media.document_id is not null then return media.document_id;end if;
 insert into public.client_documents(id,user_id,draft_id,diagnostic_id,document_type,file_name,mime_type,file_size,storage_bucket,storage_path)
 values(media.id,p_user,draft.id,case when draft.submitted_at is not null then draft.id else null end,'Déménagement — vidéo de faisabilité',media.file_name,media.mime_type,media.file_size,'moving-videos',media.storage_path);
 update public.moving_media_uploads set document_id=media.id where id=media.id;
 return media.id;
end $$;
revoke all on function public.complete_moving_media_upload(uuid,uuid) from public,anon,authenticated;
grant execute on function public.complete_moving_media_upload(uuid,uuid) to service_role;
grant select,insert,update,delete on public.client_documents to service_role;
