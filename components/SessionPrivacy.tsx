"use client";
import { Fragment, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { reconcileLocalOwner } from "@/lib/session-privacy";

export function SessionPrivacy({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let disposed = false;
    let initialized = false;
    let sequence = 0;
    let lastToken: string | null | undefined;
    let previousUser: string | null | undefined;
    const apply = (session: Session | null) => {
      if (disposed) return;
      const token = session?.access_token ?? null;
      if (initialized && token === lastToken) return;
      const wasInitialized = initialized;
      initialized = true;
      lastToken = token;
      const currentSequence = ++sequence;
      const userId = session?.user.id ?? null;
      if (!wasInitialized || (previousUser !== userId && window.location.pathname !== "/nouveau-mot-de-passe")) setReady(false);
      // Do not call Supabase Auth while its event callback holds the browser lock.
      void Promise.resolve().then(async () => {
        const response = await fetch("/api/admin/session", {
          method: "PATCH", headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (!response.ok) throw new Error("Session synchronization failed");
        const synchronization = await response.json();
        if (disposed || currentSequence !== sequence) return;
        const changed = reconcileLocalOwner(window.localStorage, userId, previousUser);
        const path = window.location.pathname;
        if ((path === "/admin" || path.startsWith("/admin/")) && path !== "/admin/connexion" && (!userId || changed || synchronization.adminCleared)) {
          window.location.replace("/admin/connexion");
          return;
        }
        // Password recovery owns its fields and must retain its completion message.
        if (wasInitialized && changed && path !== "/nouveau-mot-de-passe") setRevision(value => value + 1);
        previousUser = userId;
        setUnavailable(false);
        setReady(true);
      }).catch(() => { if (!disposed && currentSequence === sequence) setUnavailable(true); });
    };
    try {
      const supabase = getSupabaseBrowser();
      const { data } = supabase.auth.onAuthStateChange((_event, session) => apply(session));
      supabase.auth.getSession().then(({ data, error }) => {
        if (error) { if (!disposed) setUnavailable(true); return; }
        if (!initialized) apply(data.session);
      }).catch(() => { if (!disposed) setUnavailable(true); });
      return () => { disposed = true; data.subscription.unsubscribe(); };
    } catch { setUnavailable(true); }
    return () => { disposed = true; };
  }, []);
  if (unavailable) return <main className="p-6"><p role="alert">La session ne peut pas être vérifiée. Vérifiez votre connexion et autorisez le stockage du navigateur, puis rechargez la page.</p></main>;
  if (!ready) return <main className="p-6"><p role="status">Vérification de votre session…</p></main>;
  return <Fragment key={revision}>{children}</Fragment>;
}
