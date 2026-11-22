"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/Button";
import { partnerEquipmentEndpoint, PartnerSpaOptions } from "@/components/PartnerClientSpas";
import { problemLabel } from "@/lib/display-labels";
import { partnerAuthError } from "@/lib/partner-browser";
import { plannerRequest } from "@/lib/partner-planner-browser";
import { partnerClientPath, type PartnerClientSpa } from "@/lib/partner-planner";

export type PartnerAssignedVisit = {
  customer: { name: string | null; address: string | null; phone: string | null; email: string | null } | null;
  problemType: string;
  description: string;
  clientId: string | null;
  spaId: string | null;
  spas: PartnerClientSpa[];
};

export function PartnerAssignedVisitInfo({ id, job }: { id: string; job: PartnerAssignedVisit }) {
  const [spaId, setSpaId] = useState(job.spaId ?? "");
  const [saved, setSaved] = useState(job.spaId ?? "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const customer = job.customer;
  const action = "focus-ring inline-flex min-h-11 items-center text-sm font-bold text-sanispa-blue underline";

  async function linkSpa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !job.clientId) return;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const result = await plannerRequest(partnerEquipmentEndpoint, {
        payload: { action: "linkDossierSpa", client_id: job.clientId, diagnostic_id: id, spa_id: spaId || null },
      });
      if (result) {
        setSaved(spaId);
        setNotice("Le rattachement du spa a été enregistré.");
      }
    } catch (cause) { setError(partnerAuthError(cause)); }
    finally { setBusy(false); }
  }

  return <section className="min-w-0 rounded-2xl border border-sanispa-line bg-white p-4 sm:p-5" aria-labelledby="partner-active-dossier">
    <h2 id="partner-active-dossier" className="text-xl font-bold">Fiche d’intervention</h2>
    <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
      <div className="min-w-0">
        <h3 className="font-bold">Coordonnées du client</h3>
        <p className="mt-1 break-words">{customer?.name || "Client"}</p>
        <p className="break-words">{customer?.address || "Adresse à compléter"}</p>
        <div className="flex flex-wrap gap-x-3">
          {customer?.phone ? <a className={action} href={"tel:" + customer.phone.replace(/[^+\d]/g, "")}>{customer.phone}</a> : null}
          {customer?.email ? <a className={action + " break-all"} href={"mailto:" + customer.email}>{customer.email}</a> : null}
          {job.clientId ? <Link className={action} href={partnerClientPath(job.clientId)}>Ouvrir la fiche contact</Link> : null}
        </div>
      </div>
      <div className="min-w-0">
        <h3 className="font-bold">Description de la panne</h3>
        <p className="mt-1 break-words font-semibold">{problemLabel(job.problemType)}</p>
        <p className="whitespace-pre-wrap break-words">{job.description || "Aucun descriptif renseigné."}</p>
      </div>
    </div>
    {job.clientId && job.spas.length ? <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={linkSpa}>
      <label className="min-w-0 text-sm font-bold">Spa concerné
        <select value={spaId} onChange={event => setSpaId(event.currentTarget.value)} disabled={busy}
          className="focus-ring mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-sanispa-line bg-white px-2 py-1 text-base">
          <PartnerSpaOptions spas={job.spas} />
        </select>
      </label>
      <Button type="submit" variant="secondary" disabled={busy || spaId === saved}>Enregistrer le rattachement</Button>
      {notice ? <p role="status" className="w-full text-sm text-emerald-800">{notice}</p> : null}
      {error ? <p role="alert" className="w-full text-sm text-red-800">{error}</p> : null}
    </form> : null}
  </section>;
}
