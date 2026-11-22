import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { administrator } from "@/lib/admin-auth";
import { AppShell } from "@/components/AppShell";
import { guidedAssistantLabel } from "@/lib/premium-ai";
export const dynamic = "force-dynamic";
export default async function PremiumAdminPage() {
  let context; try { context = await administrator(await headers()); } catch { redirect("/admin/connexion"); }
  const now = new Date(), since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { data, error } = await context.supabase.rpc("premium_admin_summary", { p_actor: context.user.id, p_since: since });
  const models = (data?.models || []) as { model: string; requests: number; input_tokens: number; output_tokens: number }[];
  return <AppShell compact><Link href="/admin" className="font-bold underline">← Administration</Link><h1 className="mt-5 text-3xl font-bold">Premium et consommation IA</h1>
    {error ? <p role="alert" className="mt-5 text-red-800">Impossible de charger le suivi.</p> : <><div className="mt-6 grid gap-4 sm:grid-cols-3"><p className="rounded-xl bg-white p-5"><strong className="block text-3xl">{data.active_subscriptions}</strong>Accès Premium actifs</p><p className="rounded-xl bg-white p-5"><strong className="block text-3xl">{data.requests}</strong>Demandes IA ce mois (UTC)</p><p className="rounded-xl bg-white p-5"><strong className="block text-3xl">{data.unconfirmed_usage}</strong>Consommations non confirmées</p></div>
      <div className="mt-5 grid gap-4">{models.map(row => <section className="rounded-xl bg-white p-5" key={row.model}><h2 className="text-xl font-bold">{row.model || "Modèle non renseigné"}</h2><p className="mt-3">{row.requests} réponses · {Number(row.input_tokens).toLocaleString("fr-FR")} tokens reçus · {Number(row.output_tokens).toLocaleString("fr-FR")} tokens produits</p><p className="mt-2">{row.model === guidedAssistantLabel ? "0 USD. Réponses fournies par le catalogue ou les règles SANISPA." : row.model?.startsWith("gpt-5.4-mini") ? `Estimation : ${((Number(row.input_tokens)*0.75+Number(row.output_tokens)*4.5)/1000000).toFixed(4)} USD, avant taxes et remises de cache.` : "Tarif de ce modèle à vérifier : aucun coût n’est inventé."}</p></section>)}</div><p className="mt-4 text-sm leading-6">Ce suivi utilise les tokens renvoyés par l’API. Il ne remplace pas la facture OpenAI et n’inclut pas les appels dont la réponse n’a pas été confirmée. Les textes des conversations ne sont pas exposés dans ce tableau.</p></>}
  </AppShell>;
}
