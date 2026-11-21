"use client";
import { getSupabaseBrowser } from "./supabase-browser";
export async function clientRequest(path: string, init: RequestInit = {}) {
  const { data, error } = await getSupabaseBrowser().auth.getSession();
  if (error || !data.session) throw new Error("Connectez-vous à votre compte client pour continuer.");
  const r = await fetch(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${data.session.access_token}` }, cache: "no-store" });
  const body = await r.json(); if (!r.ok) throw new Error(body.error || "Service indisponible. Réessayez.");
  return body;
}
export function localDateTime(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
