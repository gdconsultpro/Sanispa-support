import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { administrator } from "@/lib/admin-auth";
import { AppShell } from "@/components/AppShell";
export const dynamic = "force-dynamic";
const outcomes: Record<string, string> = { repaired: "Spa réparé", quote_pending: "Devis en cours", abandoned: "Projet abandonné" };
export default async function AdminInterventionsPage() {
  let context;
  try { context = await administrator(await headers()); } catch { redirect("/admin/connexion"); }
  const { supabase } = context;
  const [reports, exports, appointments] = await Promise.all([
    supabase.from("intervention_reports").select("id,diagnostic_id,performed_at,findings,actions,next_steps,client_validated_at,client_outcome,responsiveness,professionalism,pricing").order("submitted_at", { ascending: false }).limit(100),
    supabase.from("synchroteam_exports").select("diagnostic_id,state,attempts").order("created_at", { ascending: false }).limit(100),
    supabase.from("partner_appointments").select("diagnostic_id,starts_at,ends_at").gte("ends_at", new Date().toISOString()).order("starts_at").limit(100),
  ]);
  const error = [reports, exports, appointments].some(r => r.error);
  return <AppShell compact><Link href="/admin" className="font-bold underline">← Administration</Link><h1 className="mt-5 text-3xl font-bold">Suivi des interventions</h1>
    {error ? <p role="alert" className="mt-5 text-red-800">Le suivi n’a pas pu être chargé complètement. Actualisez la page.</p> : null}
    <section className="mt-6 rounded-2xl bg-white p-5"><h2 className="text-xl font-bold">Rendez-vous à venir</h2><div className="mt-3 grid gap-3">{appointments.data?.map(row => <p key={row.diagnostic_id}>{new Date(row.starts_at).toLocaleString("fr-FR")} · Dossier {row.diagnostic_id.slice(0, 8).toUpperCase()}</p>)}{!appointments.data?.length ? <p>Aucun rendez-vous à venir.</p> : null}</div></section>
    <section className="mt-6 rounded-2xl bg-white p-5"><h2 className="text-xl font-bold">Comptes rendus et avis clients</h2><div className="mt-3 grid gap-4">{reports.data?.map(row => <article className="rounded-xl bg-sanispa-ice p-4" key={row.id}><h3 className="font-bold">Dossier {row.diagnostic_id.slice(0, 8).toUpperCase()} · {new Date(row.performed_at).toLocaleString("fr-FR")}</h3><p className="mt-2 whitespace-pre-wrap">Constats : {row.findings}</p><p className="mt-2 whitespace-pre-wrap">Actions : {row.actions}</p><p className="mt-2 whitespace-pre-wrap">Suite : {row.next_steps}</p><p className="mt-3 font-bold">{row.client_validated_at ? outcomes[row.client_outcome] || "Validé" : "Validation client attendue"}</p>{row.client_validated_at ? <p>Réactivité {row.responsiveness}/5 · Professionnalisme {row.professionalism}/5 · Tarif {row.pricing}/5</p> : null}</article>)}{!reports.data?.length ? <p>Aucun compte rendu déposé.</p> : null}</div></section>
    <section className="mt-6 rounded-2xl bg-white p-5"><h2 className="text-xl font-bold">File Synchroteam</h2><p className="my-3">Les nouvelles déclarations sont mises en attente avec une référence unique. Le transfert API reste désactivé tant qu’un accès en écriture et un environnement de test ne sont pas configurés.</p><ul className="grid gap-2">{exports.data?.map(row => <li key={row.diagnostic_id}>Dossier {row.diagnostic_id.slice(0, 8).toUpperCase()} · {row.state === "sent" ? "Transmis" : row.state === "review" ? "À vérifier" : "En attente de transfert"} · Tentatives : {row.attempts} · <a className="underline" href={`/api/admin/diagnostics/${row.diagnostic_id}/synchroteam-draft`}>Télécharger la préparation</a></li>)}</ul>{!exports.data?.length ? <p>Aucune nouvelle déclaration dans la file.</p> : null}</section>
  </AppShell>;
}
