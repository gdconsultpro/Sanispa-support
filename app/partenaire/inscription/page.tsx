"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { CreateAccountForm } from "@/components/CreateAccountForm";
import { Button } from "@/components/Button";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { clientRequest } from "@/lib/client-browser-api";
import { partnerPasswordPath } from "@/lib/partner-navigation";
import { partnerRegistrationSchema, type PartnerOnboarding } from "@/lib/partner-registration";

const fields = {
  companyName: { label: "Nom de l’entreprise", autoComplete: "organization", max: 150 },
  contactName: { label: "Votre nom et prénom", autoComplete: "name", max: 150 },
  phone: { label: "Téléphone professionnel", autoComplete: "tel", max: 30 },
  address: { label: "Adresse complète de l’entreprise", autoComplete: "street-address", max: 300 },
  postalCode: { label: "Code postal", autoComplete: "postal-code", max: 5 },
  city: { label: "Ville", autoComplete: "address-level2", max: 120 },
  siret: { label: "Numéro SIRET", max: 30 },
  departments: { label: "Départements d’intervention", max: 500 },
} as const;
const empty = { companyName: "", contactName: "", phone: "", address: "", postalCode: "", city: "", siret: "", departments: "" };
type Field = keyof typeof fields;
const fieldMessages: Record<Field, string> = {
  companyName: "Indiquez le nom complet de l’entreprise.",
  contactName: "Indiquez le nom et le prénom du contact.",
  phone: "Indiquez un numéro de téléphone professionnel.",
  address: "Indiquez une adresse complète.",
  postalCode: "Saisissez un code postal à 5 chiffres.",
  city: "Indiquez la ville.",
  siret: "Votre SIRET doit comporter 14 chiffres.",
  departments: "Indiquez vos numéros de départements, séparés par des virgules. Exemple : 67, 68, 90.",
};

export default function PartnerRegistration() {
  const [email, setEmail] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<PartnerOnboarding | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [form, setForm] = useState(empty);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const saving = useRef(false);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data, error: sessionError } = await getSupabaseBrowser().auth.getSession();
      if (sessionError) throw sessionError;
      if (!active || !data.session) return;
      setEmail(data.session.user.email || "");
      const onboarding: PartnerOnboarding = await clientRequest("/api/partner/registration");
      if (!active) return;
      if (onboarding.registered) {
        window.location.replace(onboarding.passwordChangeRequired ? partnerPasswordPath("/partenaire") : "/partenaire");
        return;
      }
      setStatus(onboarding);
      const existing = onboarding.candidate;
      if (existing) setForm({
        companyName: existing.company_name, contactName: existing.contact_name ?? "", phone: existing.phone ?? "",
        address: existing.address ?? "", postalCode: existing.postal_code ?? "", city: existing.city ?? "",
        siret: existing.siret ?? "", departments: (existing.departments || []).join(", "),
      });
    }
    void load().catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : "Vérification impossible.");
    }).finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [attempt]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || !status) return;
    setError("");
    const payload = partnerRegistrationSchema.safeParse({
      mode: status.candidate ? "claim" : "create",
      ...form,
      departments: form.departments.split(/[,;\s]+/).filter(Boolean),
    });
    if (!payload.success) {
      const errors = payload.error.flatten().fieldErrors;
      const invalid = (Object.keys(fields) as Field[]).filter(field => errors[field]?.length);
      setFieldErrors(Object.fromEntries(invalid.map(field => [field, fieldMessages[field]])));
      event.currentTarget.querySelector<HTMLInputElement>("input[name='" + invalid[0] + "']")?.focus();
      return;
    }
    setFieldErrors({});
    saving.current = true;
    setBusy(true);
    try {
      await clientRequest("/api/partner/registration", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload.data),
      });
      window.location.replace("/partenaire");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Inscription impossible. Réessayez.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <AppShell compact>
      <Link href="/partenaire/connexion" className="font-bold underline">← Connexion partenaire</Link>
      <section className="mx-auto mt-5 max-w-3xl rounded-3xl border border-sanispa-line bg-white p-5 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-widest text-sanispa-blue">Professionnels du spa</p>
        <h1 className="mt-3 text-3xl font-bold">{email ? "Compléter mon entreprise" : "Créer mon accès partenaire gratuit"}</h1>
        <p className="my-4 text-sm font-bold text-sanispa-steel">{email ? "E-mail confirmé · Étape 2 sur 2" : "Votre compte · Étape 1 sur 2"}</p>
        {!loaded ? <p role="status">Vérification de votre compte…</p> : null}
        {loaded && !email && !error ? <>
          <p className="my-4 leading-7">Créez votre compte, confirmez votre e-mail puis renseignez votre entreprise et votre SIRET.</p>
          <CreateAccountForm intent="partenaire" />
        </> : null}
        {loaded && status?.blocked ? <p role="alert" className="rounded-xl bg-amber-50 p-4">{status.message}</p> : null}
        {loaded && status && !status.blocked ? <form noValidate onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <p className="break-all text-sm sm:col-span-2">{email}</p>
          {status.candidate ? <p className="rounded-xl bg-sanispa-ice p-4 text-sm sm:col-span-2">SANISPA a déjà renseigné votre entreprise. Vérifiez les coordonnées avant de transmettre la fiche.</p> : null}
          {(Object.keys(fields) as Field[]).map(field => {
            const description = fields[field];
            return <div key={field} className={field === "departments" ? "sm:col-span-2" : undefined}>
              <label htmlFor={field} className="text-sm font-bold">{description.label}</label>
              <input id={field} name={field} required aria-invalid={Boolean(fieldErrors[field])}
                aria-describedby={fieldErrors[field] ? field + "-hint" : undefined}
                type={field === "phone" ? "tel" : "text"}
                autoComplete={"autoComplete" in description ? description.autoComplete : undefined}
                inputMode={field === "postalCode" || field === "siret" ? "numeric" : undefined}
                maxLength={description.max} placeholder={field === "departments" ? "Ex. 67, 68, 90" : field === "siret" ? "14 chiffres" : undefined}
                value={form[field]} onChange={event => {
                  const value = event.target.value;
                  setForm(current => ({ ...current, [field]: value }));
                  setFieldErrors(current => ({ ...current, [field]: undefined }));
                }}
                className="focus-ring mt-2 w-full min-w-0 rounded-xl border border-sanispa-line bg-white p-3 aria-invalid:border-red-700" />
              {fieldErrors[field] ? <p id={field + "-hint"} className="mt-1 text-sm text-red-800">{fieldErrors[field]}</p> : null}
            </div>;
          })}
          <p className="text-sm text-sanispa-steel sm:col-span-2">SANISPA vérifie votre entreprise avant de vous proposer des dossiers.</p>
          <Button type="submit" disabled={busy} className="justify-self-start sm:col-span-2">{busy ? "Envoi de votre fiche…" : "Envoyer ma fiche pour vérification"}</Button>
        </form> : null}
        {error ? <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">
          <p role="alert">{error}</p>
          {!status ? <button className="mt-2 font-bold underline" type="button" onClick={() => { setError(""); setLoaded(false); setAttempt(value => value + 1); }}>Réessayer</button> : null}
        </div> : null}
      </section>
    </AppShell>
  );
}
