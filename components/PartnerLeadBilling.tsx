"use client";

import { useEffect, useRef, useState } from "react";
import type { PartnerAdminItem } from "@/lib/types";

export function PartnerLeadBilling({ partner, onSaved }: {
  partner: PartnerAdminItem;
  onSaved: (partner: PartnerAdminItem) => void;
}) {
  const [leadsPaid, setLeadsPaid] = useState(partner.leads_paid === true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  const knownSetting = typeof partner.leads_paid === "boolean";

  useEffect(() => {
    setLeadsPaid(partner.leads_paid === true);
  }, [partner.id, partner.leads_paid]);

  async function saveBilling(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !knownSetting || leadsPaid === partner.leads_paid) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/admin/partners/${encodeURIComponent(partner.id)}/billing`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leads_paid: leadsPaid })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "Le réglage n’a pas pu être confirmé. Actualisez la liste avant de réessayer.");
      }
      const savedPartner = payload?.partner;
      if (!savedPartner || savedPartner.id !== partner.id || typeof savedPartner.leads_paid !== "boolean" ||
        typeof savedPartner.company_name !== "string" || typeof savedPartner.active !== "boolean" || !Array.isArray(savedPartner.departments)) {
        throw new Error("La réponse ne permet pas de confirmer le réglage. Actualisez la liste avant de réessayer.");
      }
      onSaved(savedPartner as PartnerAdminItem);
      setLeadsPaid(savedPartner.leads_paid);
      setMessage(savedPartner.leads_paid === leadsPaid
        ? `Réglage enregistré : leads ${savedPartner.leads_paid ? "payants" : "gratuits"}.`
        : "Le réglage a été modifié entre-temps. Le mode affiché est celui actuellement enregistré.");
    } catch (cause) {
      setError(cause instanceof Error && !(cause instanceof TypeError)
        ? cause.message
        : "La connexion a été interrompue. Le résultat n’est pas confirmé ; actualisez la liste avant de réessayer.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <section className="mt-5 rounded-md border border-sanispa-line bg-sanispa-ice p-4" aria-labelledby={`partner-billing-${partner.id}`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 id={`partner-billing-${partner.id}`} className="font-bold text-sanispa-navy">Mode des leads</h3>
      <p className="text-sm text-sanispa-steel">Mode enregistré : <strong className="text-sanispa-navy">{knownSetting ? partner.leads_paid ? "Payant" : "Gratuit" : "Non disponible"}</strong></p>
    </div>
    <form onSubmit={saveBilling} className="mt-4 grid gap-3">
      <label className="flex items-start gap-3 text-sm font-bold text-sanispa-navy">
        <input type="checkbox" checked={leadsPaid} disabled={busy || !knownSetting}
          onChange={event => { setLeadsPaid(event.target.checked); setError(""); setMessage(""); }}
          aria-describedby={`partner-billing-help-${partner.id}`} className="focus-ring mt-0.5 h-5 w-5 shrink-0 accent-sanispa-navy" />
        Leads payants
      </label>
      <p id={`partner-billing-help-${partner.id}`} className="text-sm leading-6 text-sanispa-steel">
        Cochez pour appliquer le tarif existant. Décochez pour permettre la prise en charge gratuite des demandes disponibles.
        Ce réglage concerne les prochaines prises en charge ; les achats et réservations déjà enregistrés conservent leurs conditions.
      </p>
      {!knownSetting ? <p role="alert" className="text-sm text-red-700">Le mode actuel n’est pas disponible. Actualisez la liste pour le consulter avant de le modifier.</p> : null}
      {error ? <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p role="status" className="rounded-md bg-white p-3 text-sm font-semibold text-sanispa-navy">{message}</p> : null}
      <button type="submit" disabled={busy || !knownSetting || leadsPaid === partner.leads_paid}
        className="focus-ring min-h-12 justify-self-start rounded-md bg-sanispa-navy px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">
        {busy ? "Enregistrement du mode…" : "Enregistrer le mode des leads"}
      </button>
    </form>
  </section>;
}
