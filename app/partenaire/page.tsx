"use client";

import Link from "next/link";
import { partnerClientsPath, partnerMapPath, partnerNewClientPath } from "@/lib/partner-planner";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ButtonLink } from "@/components/Button";
import { PartnerNavigation } from "@/components/PartnerNavigation";
import { StepHeader } from "@/components/StepHeader";
import { loadPartnerSession, partnerToken, partnerAuthError, redirectPartnerAccess } from "@/lib/partner-browser";
import { partnerPasswordPath } from "@/lib/partner-navigation";
import { partnerAppointmentLabel, partnerHasUpcomingAppointment, partnerJobState, partnerWorkLabels, type PartnerIntervention } from "@/lib/partner-work";
import { problemLabel } from "@/lib/display-labels";
import type { PartnerLeadPreview } from "@/lib/partner-leads";

type Dashboard = {
  company: string;
  pending: boolean;
  charterAccepted: boolean;
  offers: PartnerLeadPreview[];
  jobs: PartnerIntervention[];
};

export default function PartnerHomePage() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const token = await partnerToken("/partenaire");
      if (!token || controller.signal.aborted) return;
      const session = await loadPartnerSession(token);
      if (!session || controller.signal.aborted) return;
      if (session.passwordChangeRequired) {
        window.location.replace(partnerPasswordPath("/partenaire"));
        return;
      }
      const { company_name: company, verification_status } = session.partner;
      if (verification_status === "pending") {
        setDashboard({ company, pending: true, charterAccepted: false, offers: [], jobs: [] });
        return;
      }
      async function fetchSection(path: string) {
        const response = await fetch("/api/partner/" + path, {
          headers: { Authorization: "Bearer " + token }, signal: controller.signal, cache: "no-store",
        });
        if (redirectPartnerAccess(response, "/partenaire")) return null;
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Votre activité n’a pas pu être chargée.");
        return data;
      }
      const [offers, jobs, charter] = await Promise.all([
        fetchSection("leads"), fetchSection("interventions"), fetchSection("charter"),
      ]);
      if (controller.signal.aborted || !offers || !jobs || !charter) return;
      setDashboard({ company, pending: false, charterAccepted: Boolean(charter.acceptedAt), offers: offers.leads, jobs: jobs.interventions });
    }
    void load().catch(cause => {
      if (!controller.signal.aborted) setError(partnerAuthError(cause));
    });
    return () => controller.abort();
  }, [attempt]);

  const now = Date.now();
  const contacts = dashboard?.jobs.filter(job => partnerJobState(job, now) === "contact") ?? [];
  const upcoming = (dashboard?.jobs ?? [])
    .filter(job => partnerHasUpcomingAppointment(job, now))
    .sort((a, b) => Date.parse(a.partner_appointments!.starts_at) - Date.parse(b.partner_appointments!.starts_at));
  const actions = dashboard?.jobs.filter(job => ["report", "invoice"].includes(partnerJobState(job, now))) ?? [];
  const waiting = dashboard?.jobs.filter(job => ["review", "quote"].includes(partnerJobState(job, now))) ?? [];

  return (
    <AppShell compact>
      <PartnerNavigation current="Accueil" />
      <StepHeader eyebrow={dashboard?.company ?? "Espace partenaire"} title={dashboard?.pending ? "Votre inscription" : "Aujourd’hui"}
        description={dashboard?.pending ? "Suivez l’activation de votre accès partenaire." : "Vos demandes et vos interventions à suivre."} />
      {!dashboard && !error ? <p role="status">Chargement de votre espace partenaire…</p> : null}
      {error ? <section className="rounded-2xl bg-white p-5">
        <p role="alert" className="text-red-800">{error}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className="focus-ring font-bold underline" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Réessayer</button>
          <Link href="/partenaire/inscription" className="focus-ring font-bold underline">Compléter mon entreprise</Link>
        </div>
      </section> : null}
      {dashboard?.pending ? <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <p className="text-sm font-bold">E-mail confirmé · Entreprise renseignée</p>
        <h2 className="mt-2 text-xl font-bold">SIRET en cours de vérification</h2>
        <p className="mt-2">Votre fiche est entre les mains de SANISPA. Les demandes seront visibles ici après validation de votre entreprise.</p>
        <div className="mt-4 flex flex-wrap gap-3"><ButtonLink href="/partenaire/visio" variant="secondary">Demander une visio technique</ButtonLink></div>
      </section> : null}
      {dashboard && !dashboard.pending ? <div className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={partnerNewClientPath}>Ajouter un client</ButtonLink>
          <ButtonLink href={partnerClientsPath} variant="secondary">Mes clients</ButtonLink>
          <ButtonLink href={partnerMapPath} variant="secondary">Carte des interventions</ButtonLink>
        </div>
        {!dashboard.charterAccepted ? <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-lg font-bold">Charte à accepter</h2>
          <p className="my-2">Votre accès est prêt. Le responsable du compte doit accepter la charte pour prendre en charge une demande.</p>
          <ButtonLink href="/partenaire/abonnement#charte">Lire la charte</ButtonLink>
        </section> : null}
        <section className="rounded-2xl border border-sanispa-line bg-white p-5">
          <h2 className="text-xl font-bold">Demandes proposées <span className="text-sanispa-blue">({dashboard.offers.length})</span></h2>
          {dashboard.offers.length ? <ul className="mt-2 divide-y divide-sanispa-line">
            {dashboard.offers.slice(0, 3).map(offer => <li key={offer.id}>
              <Link className="focus-ring flex min-h-12 flex-wrap items-center justify-between gap-2 py-3 font-bold underline" href={"/partenaire/leads/" + offer.id}>
                <span>{offer.problemType}{offer.city ? " · " + offer.city : ""}</span><span className="text-sm">Voir la demande →</span>
              </Link>
            </li>)}
          </ul> : <p className="mt-2">Aucune demande proposée pour le moment.</p>}
          <Link className="mt-3 inline-block font-bold text-sanispa-blue underline" href="/partenaire/leads">Toutes les demandes proposées</Link>
        </section>
        <JobSection title="À contacter et à planifier" jobs={contacts} now={now} section="a-planifier" />
        <JobSection title="Rendez-vous à venir" jobs={upcoming} now={now} section="planning" />
        <JobSection title="Comptes rendus et factures à traiter" jobs={actions} now={now} section="a-terminer" />
        <JobSection title="Suivis et validations en cours" jobs={waiting} now={now} section="en-suivi" />
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold underline">
          <Link href="/partenaire/abonnement">Mon accès et la charte</Link>
          <Link href="/partenaire/mot-de-passe">Modifier mon mot de passe</Link>
        </div>
      </div> : null}
    </AppShell>
  );
}

function JobSection({ title, jobs, now, section }: { title: string; jobs: PartnerIntervention[]; now: number; section: string }) {
  return <section className="rounded-2xl border border-sanispa-line bg-white p-5">
    <h2 className="text-lg font-bold">{title} <span className="text-sanispa-blue">({jobs.length})</span></h2>
    {jobs.length ? <ul className="divide-y divide-sanispa-line">
      {jobs.slice(0, 3).map(job => <li key={job.id}>
        <Link className="focus-ring block py-3" href={"/partenaire/interventions/" + job.id}>
          <span className="block font-bold underline">{job.customers?.name || "Dossier"} · {problemLabel(job.problem_type)}</span>
          <span className="block text-sm">{section === "planning" && job.partner_appointments ? partnerAppointmentLabel(job.partner_appointments.starts_at) : partnerWorkLabels[partnerJobState(job, now)]}</span>
        </Link>
      </li>)}
    </ul> : <p className="mt-2 text-sm">Aucun dossier dans cette rubrique.</p>}
    {jobs.length > 3 ? <Link className="font-bold underline" href={"/partenaire/interventions#" + section}>Voir tous les dossiers</Link> : null}
  </section>;
}
