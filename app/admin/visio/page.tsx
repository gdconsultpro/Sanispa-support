import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { administrator } from "@/lib/admin-auth";
import { videoSession } from "@/lib/video-assistance";
import { AppShell } from "@/components/AppShell";
import { VideoAssistanceAdmin } from "@/components/VideoAssistanceAdmin";
export const dynamic = "force-dynamic";
export default async function AdminVideoPage() {
  let context; try { context = await administrator(await headers()); } catch { redirect("/admin/connexion"); }
  const { data, error } = await context.supabase.from("video_assistance_sessions").select("*").order("created_at", { ascending: false }).limit(200);
  return <AppShell><Link href="/admin" className="text-sm font-bold underline">← Administration</Link><h1 className="mt-5 text-3xl font-bold">Visios et assistance dépannage</h1><p className="mt-4 max-w-3xl leading-7 text-sanispa-steel">Confirmez les demandes des particuliers et des partenaires. La durée est de 30 minutes. Les visios sont offertes pendant la suspension des paiements ; le tarif client de référence est de 59 € TTC.</p>{error ? <p role="alert" className="mt-5 text-red-800">Chargement impossible. Actualisez la page.</p> : <VideoAssistanceAdmin initialSessions={(data || []).map(row => videoSession(row, true))} />}</AppShell>;
}
