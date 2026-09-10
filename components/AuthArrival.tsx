"use client";
import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

/** Invitations may use the configured site root instead of an explicit callback. */
export function AuthArrival() {
  const [error, setError] = useState("");
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (!hash.has("access_token")) return;
    const type = hash.get("type");
    getSupabaseBrowser().auth.getSession().then(({ data, error }) => {
      if (error || !data.session) { setError("Ce lien a expiré. Demandez un nouvel e-mail de connexion."); return; }
      window.location.replace(type === "invite" || type === "recovery" ? "/nouveau-mot-de-passe" : "/auth/retour");
    }).catch(() => setError("Connexion indisponible. Réessayez avec un nouveau lien."));
  }, []);
  return error ? <p role="alert" className="mb-4 rounded-md bg-red-50 p-3 text-red-700">{error}</p> : null;
}
