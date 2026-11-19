import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { administrator } from "@/lib/admin-auth";
import { AppShell } from "@/components/AppShell";
import { ForumModeration } from "@/components/ForumModeration";
export const dynamic = "force-dynamic";
export default async function AdminForumPage() {
  let context; try { context = await administrator(await headers()); } catch { redirect("/admin/connexion"); }
  const { data, error } = await context.supabase.from("forum_posts").select("id,title,body,state,parent_id,solicitation_flag").in("state", ["pending", "approved"]).order("state", { ascending: false }).order("created_at", { ascending: false }).limit(200);
  return <AppShell compact><Link href="/admin" className="font-bold underline">← Administration</Link><h1 className="mt-5 text-3xl font-bold">Modération du forum</h1><p className="mt-3">Les nouveaux messages sans alerte sont publiés automatiquement. Vous vérifiez les messages en attente : coordonnées, publicité, propos offensants ou conseils sensibles repérés par le filtre. Vous pouvez aussi retirer un message déjà publié.</p>{error ? <p role="alert" className="mt-4 text-red-800">Impossible de charger les messages.</p> : <ForumModeration posts={data || []} />}</AppShell>;
}
