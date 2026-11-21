"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PartnerNavigation } from "@/components/PartnerNavigation";
import { partnerToken, redirectPartnerAccess } from "@/lib/partner-browser";
import { problemLabel } from "@/lib/display-labels";
import { partnerAppointmentLabel, partnerHasUpcomingAppointment, partnerJobState, partnerWorkLabels, type PartnerIntervention } from "@/lib/partner-work";

const sections = [
  { id: "planning", title: "Rendez-vous à venir", states: ["upcoming"] },
  { id: "a-planifier", title: "À contacter et à planifier", states: ["contact"] },
  { id: "a-terminer", title: "Comptes rendus et factures à traiter", states: ["report", "invoice"] },
  { id: "en-suivi", title: "Suivis et validations en cours", states: ["review", "quote"] },
  { id: "clotures", title: "Dossiers clôturés", states: ["closed"] },
];

export default function InterventionsPage() {
  const [jobs, setJobs] = useState<PartnerIntervention[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const token = await partnerToken("/partenaire/interventions");
      if (!token || controller.signal.aborted) return;
      const response = await fetch("/api/partner/interventions", { headers: { Authorization: "Bearer " + token }, signal: controller.signal, cache: "no-store" });
      if (redirectPartnerAccess(response, "/partenaire/interventions")) return;
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      if (!controller.signal.aborted) setJobs(body.interventions);
    }
    void load().catch(error => { if (!controller.signal.aborted) setError(error.message || "Votre planning n’a pas pu être chargé."); });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    if (!jobs || !window.location.hash) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [jobs]);

  const now = Date.now();
  return <AppShell compact>
    <PartnerNavigation current="Interventions" />
    <h1 className="text-3xl font-bold">Mes interventions et mon planning</h1>
    <p className="mt-2">Retrouvez vos rendez-vous et les dossiers à terminer.</p>
    {error ? <div className="mt-4 rounded-xl bg-white p-4"><p role="alert" className="text-red-800">{error}</p><button type="button" className="mt-2 font-bold underline" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Réessayer</button></div> : null}
    {!jobs && !error ? <p role="status" className="mt-4">Chargement du planning…</p> : null}
    {jobs && !jobs.length ? <p className="mt-5 rounded-xl bg-white p-5">Vous n’avez pas encore de dossier attribué. <Link href="/partenaire/leads" className="font-bold underline">Voir les demandes proposées</Link></p> : null}
    {jobs?.length ? <div className="mt-6 grid gap-5">
      {sections.map(section => {
        const entries = jobs.filter(job => section.id === "planning"
          ? partnerHasUpcomingAppointment(job, now)
          : section.states.includes(partnerJobState(job, now)));
        if (section.id === "planning") entries.sort((a, b) => Date.parse(a.partner_appointments!.starts_at) - Date.parse(b.partner_appointments!.starts_at));
        if (!entries.length && section.id !== "planning") return null;
        return <section key={section.id} id={section.id} className="scroll-mt-5 rounded-2xl border border-sanispa-line bg-white p-5">
          <h2 className="text-xl font-bold">{section.title}</h2>
          {!entries.length ? <p className="mt-2">Aucun rendez-vous à venir.</p> : <ul className="mt-2 divide-y divide-sanispa-line">
            {entries.map(job => <li key={job.id} className="py-3">
              <p className="text-sm text-sanispa-steel">{job.public_reference || "Référence en cours"}</p>
              <h3 className="break-words text-lg font-bold">{problemLabel(job.problem_type)} · {job.customers?.name || "Client"}</h3>
              {job.partner_appointments ? <p className="mt-1 text-sm">{partnerAppointmentLabel(job.partner_appointments.starts_at)}</p> : null}
              {job.customers?.address ? <p className="break-words text-sm">{job.customers.address}</p> : null}
              <p className="mt-1 text-sm font-bold">{partnerWorkLabels[partnerJobState(job, now)]}</p>
              <Link className="focus-ring inline-flex min-h-11 items-center font-bold text-sanispa-blue underline" href={"/partenaire/interventions/" + job.id}>Ouvrir le suivi →</Link>
            </li>)}
          </ul>}
        </section>;
      })}
    </div> : null}
  </AppShell>;
}
