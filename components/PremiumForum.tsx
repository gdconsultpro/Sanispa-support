"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { clientRequest } from "@/lib/client-browser-api";
import { forumPostSchema } from "@/lib/forum-validation";
import { Button } from "./Button";
type Post = { id: string; parentId: string | null; title: string; body: string; state: string; author: string; own: boolean; createdAt: string };
export function PremiumForum() {
  const [posts, setPosts] = useState<Post[] | null>(null), [title, setTitle] = useState(""), [body, setBody] = useState(""), [parent, setParent] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => { const r = await clientRequest("/api/client/forum", { signal }); if (!signal?.aborted) setPosts(r.posts); }, []);
  useEffect(() => { const c = new AbortController(); void load(c.signal).catch(e => { if (!c.signal.aborted) setError(e.message); }); return () => c.abort(); }, [load]);
  async function submit() {
    if (busy) return; setError(""); setMessage("");
    const parsed = forumPostSchema.safeParse({ title, body, parentId: parent || null });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || "Vérifiez le titre et le message."); return; }
    setBusy(true);
    try { const result = await clientRequest("/api/client/forum", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) }); setTitle(""); setBody(""); setMessage(result.state === "approved" ? "Votre message est publié. Les autres membres peuvent le consulter." : "Votre message a bien été reçu. Une vérification est nécessaire avant sa publication."); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Envoi impossible."); }
    finally { setBusy(false); }
  }
  return <div className="mt-6 grid gap-5">{error ? <p role="alert" className="rounded-xl bg-white p-4 text-red-800">{error} <Link href="/connexion?next=forum" className="underline">Me connecter</Link></p> : null}{message ? <p role="status" className="rounded-xl bg-emerald-50 p-4">{message}</p> : null}
    {posts ? <><form className="grid gap-4 rounded-2xl border border-sanispa-line bg-white p-5" onSubmit={e => { e.preventDefault(); void submit(); }}><h2 className="text-xl font-bold">Participer à la discussion</h2><p className="text-sm">Ne publiez pas de coordonnées personnelles ni d’offre commerciale. Une expérience partagée ne remplace pas l’avis d’un professionnel.</p>
      <label>Mon message concerne<select className="mt-2 w-full rounded-xl border border-sanispa-line p-3" value={parent} onChange={e => setParent(e.target.value)}><option value="">Une nouvelle discussion</option>{posts.filter(p => !p.parentId && p.state === "approved").map(p => <option value={p.id} key={p.id}>{p.title}</option>)}</select></label>
      {!parent ? <label>Titre <span className="text-sm">(3 à 150 caractères)</span><input className="mt-2 w-full rounded-xl border border-sanispa-line p-3" required minLength={3} maxLength={150} value={title} onChange={e => setTitle(e.target.value)} /></label> : null}
      <label>Mon message<textarea className="mt-2 w-full rounded-xl border border-sanispa-line p-3" required minLength={10} maxLength={3000} rows={4} value={body} onChange={e => setBody(e.target.value)} /></label><p className="text-sm">Les messages sont publiés automatiquement après un premier contrôle. Certains peuvent nécessiter une vérification.</p><Button type="submit" disabled={busy}>Publier mon message</Button>
    </form>
    {posts.filter(p => !p.parentId).map(p => <article key={p.id} className="rounded-2xl border border-sanispa-line bg-white p-5"><p className="text-sm">{p.author} · {new Date(p.createdAt).toLocaleString("fr-FR")}{p.state !== "approved" ? ` · ${p.state === "pending" ? "En attente de modération" : "Non publié"}` : ""}</p><h2 className="mt-2 text-xl font-bold">{p.title}</h2><p className="mt-3 whitespace-pre-wrap break-words leading-7">{p.body}</p><div className="mt-4 grid gap-3">{posts.filter(reply => reply.parentId === p.id).reverse().map(reply => <div key={reply.id} className="rounded-xl bg-sanispa-ice p-4"><p className="text-sm font-bold">{reply.author}{reply.state !== "approved" ? " · En attente de modération / non publié" : ""}</p><p className="mt-2 whitespace-pre-wrap break-words">{reply.body}</p></div>)}</div>{p.state === "approved" ? <button className="mt-4 font-bold underline" onClick={() => { setParent(p.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Répondre à cette discussion</button> : null}</article>)}
    {!posts.length ? <p>Aucune discussion publiée pour le moment. Vous pouvez proposer la première.</p> : null}</> : !error ? <p role="status">Chargement des discussions…</p> : null}
  </div>;
}
