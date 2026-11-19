"use client";
import { useState } from "react";
import { Button } from "./Button";
export function ForumModeration({ posts }: { posts: { id: string; title: string; body: string; solicitation_flag: boolean; state: string; parent_id: string | null }[] }) {
  const [rows, setRows] = useState(posts), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [view, setView] = useState("pending");
  const visible = rows.filter(post => post.state === view);
  async function moderate(id: string, state: "approved" | "rejected") {
    if (busy) return; setBusy(true); setError("");
    try { const r = await fetch("/api/admin/forum", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, state }) }); const body = await r.json(); if (!r.ok) throw new Error(body.error); setRows(current => current.filter(p => p.id !== id)); }
    catch (e) { setError(e instanceof Error ? e.message : "Action impossible."); }
    finally { setBusy(false); }
  }
  return <div className="mt-5 grid gap-4"><div className="flex flex-wrap gap-3" aria-label="Filtrer les messages">{[{ state: "pending", label: "À vérifier" }, { state: "approved", label: "Publiés" }].map(item => <Button key={item.state} variant={view === item.state ? "primary" : "secondary"} aria-pressed={view === item.state} onClick={() => setView(item.state)}>{item.label} ({rows.filter(post => post.state === item.state).length})</Button>)}</div>{error ? <p role="alert" className="text-red-800">{error}</p> : null}{visible.map(p => <article key={p.id} className="rounded-2xl border border-sanispa-line bg-white p-5"><p className="text-sm font-bold">{p.parent_id ? "Réponse" : "Discussion"} · {p.state === "approved" ? "Publié" : "En attente"}</p>{p.solicitation_flag ? <p className="mt-2 rounded-xl bg-amber-50 p-3 font-bold">Coordonnées, lien ou démarchage possible : vérification manuelle nécessaire.</p> : null}<h2 className="mt-3 text-xl font-bold">{p.title || "Réponse à une discussion"}</h2><p className="my-4 whitespace-pre-wrap">{p.body}</p><div className="flex flex-wrap gap-3">{p.state === "pending" ? <Button disabled={busy} onClick={() => void moderate(p.id, "approved")}>Publier ce message</Button> : null}<Button disabled={busy} onClick={() => void moderate(p.id, "rejected")}>{p.state === "approved" ? "Retirer ce message" : "Refuser ce message"}</Button></div></article>)}{!visible.length ? <p>{view === "pending" ? "Aucun message en attente de vérification." : "Aucun message publié dans cette liste."}</p> : null}</div>;
}
