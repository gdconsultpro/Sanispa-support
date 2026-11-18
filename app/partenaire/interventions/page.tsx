"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { partnerToken, redirectPartnerAccess } from "@/lib/partner-browser";
import { problemLabel, statusLabel } from "@/lib/display-labels";
type Job = { id: string; problem_type: string; status: string; customers: { name: string; address: string } | null; partner_appointments: { starts_at: string; ends_at: string } | null; intervention_reports: { id: string; client_validated_at: string | null }[] };
export default function InterventionsPage() {
  const [jobs, setJobs] = useState<Job[] | null>(null), [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const token = await partnerToken("/partenaire/interventions"); if (!token) return;
      const r = await fetch("/api/partner/interventions", { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: "no-store" });
      if (redirectPartnerAccess(r, "/partenaire/interventions")) return;
      const body = await r.json(); if (!r.ok) throw new Error(body.error);
      if (!controller.signal.aborted) setJobs(body.interventions);
    }
    void load().catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, []);
  const planned = jobs?.filter(j => j.partner_appointments && !["CLOSED", "terminé"].includes(j.status)).sort((a, b) => Date.parse(a.partner_appointments!.starts_at) - Date.parse(b.partner_appointments!.starts_at));
  return <AppShell compact><Link href="/partenaire" className="font-bold underline">← Espace partenaire</Link><h1 className="mt-5 text-3xl font-bold">Mes interventions et mon planning</h1>
    <p className="mt-3">Vos dossiers attribués, leurs rendez-vous, comptes rendus et factures.</p>
    {error ? <p role="alert" className="mt-4 text-red-800">{error}</p> : null}
    {!jobs && !error ? <p role="status" className="mt-4">Chargement…</p> : null}
    {planned?.length ? <section className="mt-6 rounded-2xl bg-emerald-50 p-5"><h2 className="text-xl font-bold">Mon planning</h2><ul className="mt-3 grid gap-3">{planned.map(j => <li key={j.id}><Link className="underline" href={`/partenaire/interventions/${j.id}`}>{new Date(j.partner_appointments!.starts_at).toLocaleString("fr-FR")} · {j.customers?.name || "Client"}</Link></li>)}</ul></section> : null}
    <div className="mt-6 grid gap-4">{jobs?.map(j => <article key={j.id} className="rounded-2xl border border-sanispa-line bg-white p-5"><h2 className="text-xl font-bold">{problemLabel(j.problem_type)} · {j.customers?.name}</h2><p className="mt-2">{j.customers?.address}</p><p className="mt-2">{statusLabel(j.status)}{j.intervention_reports.some(r => !r.client_validated_at) ? " · Avis du client attendu" : ""}</p><Link className="mt-4 inline-block font-bold underline" href={`/partenaire/interventions/${j.id}`}>Ouvrir le suivi d’intervention →</Link></article>)}</div>
    {jobs && !jobs.length ? <p className="mt-6 rounded-xl bg-white p-5">Vous n’avez pas encore de dossier attribué. Les contacts à acquérir se trouvent dans les demandes disponibles.</p> : null}
  </AppShell>;
}
