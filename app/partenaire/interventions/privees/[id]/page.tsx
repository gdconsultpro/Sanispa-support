"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ButtonLink } from "@/components/Button";
import { PartnerNavigation } from "@/components/PartnerNavigation";
import { PartnerVisitDelete } from "@/components/PartnerVisitDelete";
import { PartnerVisitUnplan } from "@/components/PartnerVisitUnplan";
import { partnerAuthError } from "@/lib/partner-browser";
import { plannerRequest } from "@/lib/partner-planner-browser";
import {
  partnerClientAddress, partnerClientPath, partnerClientVisitTiming, partnerEditVisitPath, partnerSpaOption, partnerVisitMapPath,
  type PartnerPrivateVisitFile,
} from "@/lib/partner-planner";

const endpoint = "/api/partner/planning";
const listPath = "/partenaire/interventions";
const link = "focus-ring inline-flex min-h-11 items-center break-words text-sm font-bold text-sanispa-blue underline";
const panel = "min-w-0 rounded-2xl border border-sanispa-line bg-white p-4 sm:p-5";
const dateTime = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" });

export default function PrivateInterventionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [file, setFile] = useState<PartnerPrivateVisitFile | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setError("");
    const query = new URLSearchParams({ section: "visit", id });
    void plannerRequest(endpoint + "?" + query, { signal: controller.signal }).then((result: PartnerPrivateVisitFile | null) => {
      if (result && !controller.signal.aborted) setFile(result);
    }).catch(cause => { if (!controller.signal.aborted) setError(partnerAuthError(cause)); });
    return () => controller.abort();
  }, [id, revision]);

  const current = file?.visit.id === id ? file : null;
  const visit = current?.visit;
  const timing = visit ? partnerClientVisitTiming(visit.ends_at, Date.now()) : null;
  const backToContact = timing === "past" && visit && !visit.client.deleted_at;
  const technician = current?.technicians.find(member => member.id === visit?.technician_id)?.name;
  const title = timing === "past" ? "Intervention passée" : "Fiche d’intervention";
  async function change(action: "unplanVisit" | "deleteVisit") {
    if (!visit || busy) return;
    setBusy(true);
    try {
      const result = await plannerRequest(endpoint, { payload: { action, id: visit.id, expected_at: visit.updated_at } });
      if (!result) throw new Error("Reconnectez-vous pour modifier l’intervention.");
      if (action === "deleteVisit") router.replace(listPath);
      else {
        setNotice("Le créneau a été retiré. L’intervention est de nouveau à planifier.");
        setRevision(value => value + 1);
      }
    } finally { setBusy(false); }
  }

  return <AppShell compact>
    <PartnerNavigation current="Interventions" />
    <Link className={link} href={backToContact ? partnerClientPath(visit.client.id) : listPath}>
      ← {backToContact ? "Fiche contact client" : "Mes interventions"}
    </Link>
    <h1 className="mt-2 text-3xl font-bold">{title}</h1>
    {error ? <div className="mt-3"><p role="alert" className="text-red-800">{error}</p>
      <button type="button" className={link} onClick={() => setRevision(value => value + 1)}>Réessayer</button></div> : null}
    {!current && !error ? <p role="status" className="mt-3">Chargement de l’intervention…</p> : null}
    {notice ? <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-emerald-900">{notice}</p> : null}
    {visit && current ? <div className="mt-4 grid min-w-0 gap-4">
      <section className={panel} aria-labelledby="visit-details">
        <h2 className="break-words text-xl font-bold" id="visit-details">{visit.title}</h2>
        {timing === "pending" ? <p className="mt-1 font-bold text-amber-800">À planifier</p> : null}
        {timing === "scheduled" ? <p className="mt-1 font-bold text-sanispa-blue">Planifiée</p> : null}
        {visit.starts_at && visit.ends_at ? <p className="mt-1">{dateTime.formatRange(new Date(visit.starts_at), new Date(visit.ends_at))}</p> : null}
        {technician ? <p className="text-sm">{technician}</p> : null}
        {current.spa ? <p className="mt-2 break-words text-sm font-bold">Spa concerné · {partnerSpaOption(current.spa)}</p> : null}
        <h3 className="mt-4 font-bold">Description de la panne ou de l’intervention</h3>
        <p className="mt-1 whitespace-pre-wrap break-words">{visit.description || "Aucun descriptif renseigné."}</p>
        {timing !== "past" ? <div className="mt-3 flex flex-wrap items-start gap-x-4 gap-y-2">
          <ButtonLink href={partnerEditVisitPath(id)}>{timing === "pending" ? "Planifier ou modifier" : "Modifier l’intervention"}</ButtonLink>
          <Link className={link} href={partnerVisitMapPath(id, visit.starts_at)}>Retrouver sur la carte</Link>
          {timing === "scheduled" ? <PartnerVisitUnplan disabled={busy} onUnplan={() => change("unplanVisit")} /> : null}
          <PartnerVisitDelete disabled={busy} onDelete={() => change("deleteVisit")} />
        </div> : null}
      </section>
      <section className={panel} aria-labelledby="visit-contact">
        <h2 id="visit-contact" className="text-xl font-bold">Coordonnées du client</h2>
        <p className="mt-2 break-words font-bold">{visit.client.name}</p>
        <p className="break-words">{partnerClientAddress(visit.client) || "Adresse à compléter"}</p>
        <div className="flex flex-wrap gap-x-4">
          {visit.client.phone ? <a className={link} href={"tel:" + visit.client.phone.replace(/[^+\d]/g, "")}>{visit.client.phone}</a> : null}
          {visit.client.email ? <a className={link} href={"mailto:" + visit.client.email}>{visit.client.email}</a> : null}
          {!visit.client.deleted_at ? <Link className={link} href={partnerClientPath(visit.client.id)}>Ouvrir la fiche contact</Link> : null}
        </div>
      </section>
    </div> : null}
  </AppShell>;
}
