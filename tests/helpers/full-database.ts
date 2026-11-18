import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
export async function fullDatabase() {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}',encrypted_password text,banned_until timestamptz,raw_app_meta_data jsonb default '{}');
 create table auth.sessions(id uuid primary key,user_id uuid,factor_id uuid,aal text,not_after timestamptz);
 create table auth.mfa_factors(id uuid primary key,user_id uuid,status text,factor_type text);
 create function auth.role() returns text language sql as $$select current_user::text$$;
 create function auth.uid() returns uuid language sql as $$select null::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
 create table storage.objects(id uuid,bucket_id text);`);
  await db.exec(
    (await readFile("supabase/schema.sql", "utf8")).replace(
      'create extension if not exists "pgcrypto";',
      "",
    ),
  );
  for (const file of (await readdir("supabase/migrations")).sort())
    await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  await db.exec("update private.commercial_configuration set payments_paused=false");
  return db;
}
