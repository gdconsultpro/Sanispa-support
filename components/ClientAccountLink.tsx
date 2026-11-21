"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { clientDisplayName, clientProfileUpdated } from "@/lib/client-display-name";
import { useClientSession } from "./SessionPrivacy";

export function ClientAccountLink({ clientSpace }: { clientSpace: boolean }) {
  const session = useClientSession();
  const userId = session?.user.email_confirmed_at ? session.user.id : "";
  const token = session?.access_token;
  const [profileLabel, setProfileLabel] = useState({ userId: "", name: "" });

  useEffect(() => {
    if (!userId || !token) return;
    let pending: AbortController | undefined;
    async function loadLabel() {
      pending?.abort();
      const controller = new AbortController();
      pending = controller;
      try {
        const response = await fetch("/api/client/profile", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!response.ok) return;
        const { profile } = await response.json();
        if (!controller.signal.aborted) setProfileLabel({
          userId, name: clientDisplayName(profile?.first_name, profile?.last_name),
        });
      } catch {
        // L’indication de connexion reste visible pendant une indisponibilité du profil.
      }
    }
    void loadLabel();
    window.addEventListener(clientProfileUpdated, loadLabel);
    return () => {
      pending?.abort();
      window.removeEventListener(clientProfileUpdated, loadLabel);
    };
  }, [token, userId]);

  const name = profileLabel.userId === userId ? profileLabel.name : "";
  return (
    <Link href="/espace-client"
      aria-label={userId ? `Mon espace spa · Connecté${name ? ` · ${name}` : ""}` : undefined}
      className={`focus-ring min-w-0 max-w-full rounded-full border border-sanispa-line bg-white px-4 py-3 ${clientSpace && !userId ? "hidden sm:inline-flex" : ""}`}>
      <span className="break-words">{name || "Mon espace spa"}</span>
      {userId ? <span aria-hidden="true" className="ml-2 text-xs font-semibold text-emerald-700">Connecté</span> : null}
    </Link>
  );
}
