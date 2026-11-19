"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { clientRequest } from "@/lib/client-browser-api";
type Manual = { id: string; brand: string; model: string; title: string; source_url: string; source_kind: string };
export default function ManualsPage() {
  const [manuals, setManuals] = useState<Manual[] | null>(null), [search, setSearch] = useState(""), [error, setError] = useState("");
  useEffect(() => { const c = new AbortController(); clientRequest("/api/client/manuals", { signal: c.signal }).then(r => { if (!c.signal.aborted) setManuals(r.manuals); }).catch(e => { if (!c.signal.aborted) setError(e.message); }); return () => c.abort(); }, []);
  const filtered = manuals?.filter(m => `${m.brand} ${m.model} ${m.title}`.toLowerCase().includes(search.toLowerCase()));
  return <AppShell compact><Link href="/premium" className="font-bold underline">← Mon espace spa</Link><h1 className="mt-5 text-3xl font-bold">Les notices en français de mon spa</h1><p className="mt-3 leading-7">Relevez la marque et la référence de votre clavier sans démontage, puis choisissez la documentation correspondante. Une ressemblance visuelle seule ne suffit pas à confirmer une référence.</p>
    {error ? <p role="alert" className="mt-5 rounded-xl bg-white p-4 text-red-800">{error} <Link className="underline" href="/connexion?next=notices">Me connecter à mon compte</Link></p> : null}
    {manuals ? <><label className="mt-5 block font-bold">Marque ou modèle<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ex. Balboa TP600, Gecko in.k300…" className="mt-2 w-full rounded-xl border border-sanispa-line bg-white p-3" /></label><div className="mt-5 grid gap-4">{filtered?.map(m => <article key={m.id} className="rounded-2xl border border-sanispa-line bg-white p-5"><p className="text-sm font-bold text-sanispa-blue">{m.brand} · {m.model} · Français</p><h2 className="mt-2 text-xl font-bold">{m.title}</h2><a href={m.source_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block font-bold underline">{m.source_kind === "manual" ? "Ouvrir la notice du fabricant" : "Consulter la documentation du fabricant"} ↗</a></article>)}</div>
      {!filtered?.length ? <p className="mt-4">Aucune notice en français vérifiée ne correspond à votre recherche. SANISPA doit confirmer la bonne référence avant de l’ajouter.</p> : null}<p className="mt-5 text-sm leading-6">La base est en cours d’enrichissement, pour les références absentes, dont Joyonway et Ethink/KL8. Seuls les documents dont la version française est vérifiée sont proposés. Les catalogues du fabricant sont distingués des notices exactes ; l’IA ne vous inventera pas de document.</p><Link href="/premium/assistant?topic=notices" className="mt-4 inline-block font-bold underline">Demander de l’aide pour identifier la référence →</Link></> : !error ? <p role="status" className="mt-5">Chargement des notices…</p> : null}
  </AppShell>;
}
