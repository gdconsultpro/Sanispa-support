"use client";
import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
export function AdminSignOut() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/session", { method: "DELETE" });
      await getSupabaseBrowser().auth.signOut({ scope: "local" });
      if (!response.ok && response.status !== 401) throw new Error();
      window.location.replace("/admin/connexion");
    } catch { setError("Déconnexion incomplète. Réessayez pour révoquer la session."); setBusy(false); }
  }
  return <div className="mb-4 flex flex-wrap items-center gap-3"><button onClick={logout} disabled={busy} className="focus-ring rounded-md border bg-white px-4 py-2 text-sm font-bold">{busy ? "Déconnexion…" : "Déconnexion administrateur"}</button>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}</div>;
}
