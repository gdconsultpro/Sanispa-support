"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
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
  canEdit: boolean;
};
const fields = [
  { name: "address", label: "Adresse", autoComplete: "street-address", maxLength: 300 },
  { name: "postal_code", label: "Code postal", autoComplete: "postal-code", inputMode: "numeric", pattern: "[0-9]{5}", maxLength: 5 },
  { name: "city", label: "Ville", autoComplete: "address-level2", maxLength: 120 },
  { name: "phone", label: "Téléphone", type: "tel", autoComplete: "tel", maxLength: 30 },
  { name: "email", label: "E-mail de contact", type: "email", autoComplete: "email", maxLength: 254 },
  { name: "siret", label: "SIRET", inputMode: "numeric", maxLength: 30 },
] as const;
type EditableField = typeof fields[number]["name"];
type Details = Record<EditableField, string>;
const panel = "min-w-0 rounded-2xl border border-sanispa-line bg-white p-4 sm:p-5";
const verification = { pending: "SIRET en cours de vérification", verified: "SIRET vérifié", existing: "Accès partenaire actif" } as const;

export default function PartnerAccountPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [details, setDetails] = useState<Details | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
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
  const siretChanged = Boolean(details && details.siret.replace(/\s/g, "") !== (company?.siret ?? ""));

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!company || !details || saving) return;
    const changes: Partial<Details> = {};
    for (const { name } of fields) {
      const value = name === "siret" ? details[name].replace(/\s/g, "") : details[name].trim();
      if (value !== (company[name] ?? "")) changes[name] = value;
    }
    if (changes.siret !== undefined && !/^\d{14}$/.test(changes.siret)) {
      setError("Saisissez un SIRET à 14 chiffres.");
      return;
    }
    setError("");
    if (!Object.keys(changes).length) {
      setDetails(null);
      return;
    }
    setSaving(true);
    try {
      const result: (Account & { siretChanged: boolean }) | null = await plannerRequest("/api/partner/account", { method: "PATCH", payload: changes });
      if (!result) return;
      setAccount(result);
      setDetails(null);
      setNotice(result.siretChanged ? "Votre nouveau SIRET est en attente de validation par SANISPA." : "Vos coordonnées ont été enregistrées.");
    } catch (cause) {
      setError(partnerAuthError(cause));
    } finally {
      setSaving(false);
    }
  }

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
        {details ? <form className="mt-4" onSubmit={saveDetails}>
          <fieldset disabled={saving} className="grid min-w-0 gap-3 sm:grid-cols-2">
            {fields.map(({ name, label, ...input }) => <label key={name} className={`block min-w-0 text-sm font-bold ${name === "address" ? "sm:col-span-2" : ""}`}>
              {label}
              <input {...input} value={details[name]}
                onChange={event => setDetails({ ...details, [name]: event.target.value })}
                required={Boolean(company[name]) || (name !== "siret" && siretChanged)}
                aria-describedby={name === "siret" && siretChanged ? "siret-review-notice" : undefined}
                className="focus-ring mt-1 block min-h-11 w-full min-w-0 rounded-md border border-sanispa-line px-3 py-2 text-base font-normal" />
            </label>)}
          </fieldset>
          {siretChanged ? <p id="siret-review-notice" className="mt-3 text-sm text-amber-900">SANISPA devra valider votre nouveau SIRET.</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</Button>
            <Button type="button" variant="secondary" disabled={saving} onClick={() => { setDetails(null); setError(""); }}>Annuler</Button>
          </div>
        </form> : <>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="min-w-0"><dt className="text-sm font-bold">Contact</dt><dd className="break-words">{company.contact_name || "Non renseigné"}</dd></div>
          <div className="min-w-0"><dt className="text-sm font-bold">SIRET</dt><dd>{company.siret || "Non renseigné"}</dd></div>
          <div className="min-w-0 sm:col-span-2"><dt className="text-sm font-bold">Adresse</dt><dd className="break-words">{address || "Non renseignée"}</dd></div>
          <div className="min-w-0"><dt className="text-sm font-bold">Téléphone</dt><dd className="break-words">{company.phone || "Non renseigné"}</dd></div>
          <div className="min-w-0"><dt className="text-sm font-bold">E-mail de contact</dt><dd className="break-all">{company.email || "Non renseigné"}</dd></div>
        </dl>
        {account.canEdit ? <div className="mt-4"><Button type="button" variant="secondary" onClick={() => {
          setError("");
          setNotice("");
          setDetails({ address: company.address ?? "", postal_code: company.postal_code ?? "", city: company.city ?? "",
            phone: company.phone ?? "", email: company.email ?? "", siret: company.siret ?? "" });
        }}>Modifier les coordonnées</Button></div> : null}
        {notice ? <p role="status" className="mt-3 text-sm font-semibold">{notice}</p> : null}
        </>}
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
