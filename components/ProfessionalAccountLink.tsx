"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { partnerAccountPath, partnerLoginPath, withPartnerTimeout } from "@/lib/partner-navigation";
import { useClientSession } from "./SessionPrivacy";

type Access = { status: "guest" | "checking" | "other" } | { status: "partner"; passwordChangeRequired: boolean };
const ProfessionalAccount = createContext<Access>({ status: "guest" });
export const useProfessionalAccount = () => useContext(ProfessionalAccount);

export function ProfessionalAccountProvider({ children }: { children: ReactNode }) {
  const token = useClientSession()?.access_token;
  const [resolved, setResolved] = useState<{ token: string; access: Access } | null>(null);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    async function check(accessToken: string) {
      let access: Access = { status: "other" };
      try {
        const response = await withPartnerTimeout(fetch("/api/partner/session", {
          headers: { Authorization: "Bearer " + accessToken },
          cache: "no-store",
          signal: controller.signal,
        }), 10000);
        if (response.ok) {
          const { partner, passwordChangeRequired } = await response.json();
          if (partner?.id && typeof passwordChangeRequired === "boolean") access = { status: "partner", passwordChangeRequired };
        }
      } catch { /* L’espace partenaire peut toujours vérifier la session lors de son ouverture. */ }
      if (!controller.signal.aborted) setResolved({ token: accessToken, access });
    }
    void check(token);
    return () => controller.abort();
  }, [token]);

  const access: Access = !token ? { status: "guest" }
    : resolved?.token === token ? resolved.access : { status: "checking" };
  return <ProfessionalAccount.Provider value={access}>{children}</ProfessionalAccount.Provider>;
}

export function ProfessionalAccountLink({ clientSpace }: { clientSpace: boolean }) {
  const { status } = useProfessionalAccount();
  const label = status === "partner" ? "Mon compte" : status === "guest" ? "Professionnels" : "Espace pro";
  const href = status === "partner" || status === "checking" ? partnerAccountPath : partnerLoginPath(partnerAccountPath);
  return <Link href={href} className={`focus-ring rounded-full border border-sanispa-line bg-white px-4 py-3 ${clientSpace && status !== "partner" ? "hidden sm:inline-flex" : ""}`}>
    {label}
  </Link>;
}
