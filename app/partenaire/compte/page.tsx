"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button, ButtonLink } from "@/components/Button";
import { PartnerNavigation } from "@/components/PartnerNavigation";
import { partnerAuthError } from "@/lib/partner-browser";
import { partnerAccountPath, partnerLoginPath, partnerPasswordPath, withPartnerTimeout } from "@/lib/partner-navigation";
import { plannerRequest } from "@/lib/partner-planner-browser";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type Account = {
  company: {
    company_name: string; contact_name: string | null; email: string | null; phone: string | null; address: string | null;
    postal_code: string | null; city: string | null; siret: string | null; verification_status: "pending" | "verified" | "existing";
  };
  loginEmail: string;
};
const panel = "min-w-0 rounded-2xl border border-sanispa-line bg-white p-4 sm:p-5";
const verification = { pending: "SIRET en cours de vérification", verified: "SIRET vérifié", existing: "Accès partenaire actif" } as const;

export default function PartnerAccountPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    void plannerRequest("/api/partner/account", { signal: controller.signal }).then((result: Account | null) => {
      if (result && !controller.signal.aborted) setAccount(result);
    }).catch(cause => { if (!controller.signal.aborted) setError(partnerAuthError(cause)); });
    return () => controller.abort();
  }, [revision]);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setError("");
    try {
      const { error } = await withPartnerTimeout(getSupabaseBrowser().auth.signOut({ scope: "local" }));
      if (error) throw error;
      window.location.replace(partnerLoginPath(partnerAccountPath));
    } catch (cause) { setError(partnerAuthError(cause)); setSigningOut(false); }
  }

  const company = account?.company;
  const address = company ? [company.address, [company.postal_code, company.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
  return <AppShell compact>
    <PartnerNavigation current="Mon compte" />
    <h1 className="text-3xl font-bold">Mon compte partenaire</h1>
    {!account && !error ? <p role="status" className="mt-4">Chargement de votre compte…</p> : null}
    {error ? <div className="my-4 rounded-xl bg-red-50 p-4">
      <p role="alert" className="text-red-800">{error}</p>
      {!account ? <div className="mt-2 flex flex-wrap gap-x-4">
        <button type="button" className="min-h-11 font-bold underline" onClick={() => setRevision(value => value + 1)}>Réessayer</button>
        <Link className="inline-flex min-h-11 items-center font-bold underline" href={partnerLoginPath(partnerAccountPath)}>Revenir à la connexion</Link>
      </div> : null}
    </div> : null}
    {company && account ? <div className="mt-5 grid gap-4 md:grid-cols-2">
      <section className={panel} aria-labelledby="partner-company">
        <h2 id="partner-company" className="break-words text-xl font-bold">{company.company_name}</h2>
        <p className={`mt-2 inline-block rounded-md px-2 py-1 text-sm font-bold ${company.verification_status === "pending" ? "bg-amber-100 text-amber-900" : "bg-emerald-50 text-emerald-900"}`}>
          {verification[company.verification_status]}
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="min-w-0"><dt className="text-sm font-bold">Contact</dt><dd className="break-words">{company.contact_name || "Non renseigné"}</dd></div>
          <div className="min-w-0"><dt className="text-sm font-bold">SIRET</dt><dd>{company.siret || "Non renseigné"}</dd></div>
          <div className="min-w-0 sm:col-span-2"><dt className="text-sm font-bold">Adresse</dt><dd className="break-words">{address || "Non renseignée"}</dd></div>
          <div className="min-w-0"><dt className="text-sm font-bold">Téléphone</dt><dd className="break-words">{company.phone || "Non renseigné"}</dd></div>
          <div className="min-w-0"><dt className="text-sm font-bold">E-mail de l’entreprise</dt><dd className="break-all">{company.email || "Non renseigné"}</dd></div>
        </dl>
      </section>
      <section className={panel} aria-labelledby="partner-login-settings">
        <h2 id="partner-login-settings" className="text-xl font-bold">Connexion et accès</h2>
        <p className="mt-3 text-sm font-bold">E-mail de connexion</p>
        <p className="break-all">{account.loginEmail}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <ButtonLink variant="secondary" href={partnerPasswordPath(partnerAccountPath)}>Modifier mon mot de passe</ButtonLink>
          <ButtonLink variant="secondary" href="/partenaire/abonnement">Mon accès et la charte</ButtonLink>
          <Button type="button" variant="ghost" disabled={signingOut} onClick={() => void signOut()}>
            {signingOut ? "Déconnexion…" : "Se déconnecter"}
          </Button>
        </div>
      </section>
    </div> : null}
  </AppShell>;
}
