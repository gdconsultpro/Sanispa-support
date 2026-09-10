"use client";
import { Fragment, useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { reconcileLocalOwner } from "@/lib/session-privacy";

export function SessionPrivacy({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let disposed = false;
    let initialized = false;
    let previousUser: string | null | undefined;
    const apply = (userId: string | null) => {
      if (disposed) return;
      try {
        const changed = reconcileLocalOwner(window.localStorage, userId, previousUser);
        const path = window.location.pathname;
        // A remount would reuse the server-rendered administration payload. Discard it
        // through a full navigation as soon as its browser identity changes or signs out.
        if ((path === "/admin" || path.startsWith("/admin/")) && path !== "/admin/connexion" && (!userId || (initialized && changed))) {
          setReady(false);
          window.location.replace("/admin/connexion");
          return;
        }
        // Remount private views, including an assistance conversation open in another tab.
        // Password recovery clears its own fields and must retain its completion message.
        if (initialized && changed && window.location.pathname !== "/nouveau-mot-de-passe") setRevision(value => value + 1);
        previousUser = userId;
        initialized = true;
        setReady(true);
      } catch { setUnavailable(true); }
    };
    try {
      const supabase = getSupabaseBrowser();
      const { data } = supabase.auth.onAuthStateChange((_event, session) => apply(session?.user.id ?? null));
      supabase.auth.getSession().then(({ data, error }) => {
        if (error) { if (!disposed) setUnavailable(true); return; }
        if (!initialized) apply(data.session?.user.id ?? null);
      }).catch(() => { if (!disposed) setUnavailable(true); });
      return () => { disposed = true; data.subscription.unsubscribe(); };
    } catch { setUnavailable(true); }
    return () => { disposed = true; };
  }, []);
  if (unavailable) return <main className="p-6"><p role="alert">La session ne peut pas être vérifiée sur cet appareil. Autorisez le stockage du navigateur, puis rechargez la page.</p></main>;
  if (!ready) return <main className="p-6"><p role="status">Vérification de votre session…</p></main>;
  return <Fragment key={revision}>{children}</Fragment>;
}
