"use client";
import { useEffect, useState } from "react";
import { partnerCharterClauses, partnerCharterVersion } from "@/lib/partner-charter";
import { partnerToken } from "@/lib/partner-browser";
import { Button } from "./Button";
export function PartnerCharter() {
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null), [checked, setChecked] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    async function load() {
      const token = await partnerToken("/partenaire/abonnement"); if (!token) return;
      const r = await fetch("/api/partner/charter", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const body = await r.json(); if (!r.ok) throw new Error(body.error);
      if (!disposed) setAcceptedAt(body.acceptedAt);
    }
    void load().catch(e => { if (!disposed) setError(e.message); });
    return () => { disposed = true; };
  }, []);
  async function accept() {
    if (busy || !checked) return; setBusy(true); setError("");
    try {
      const token = await partnerToken("/partenaire/abonnement"); if (!token) return;
      const r = await fetch("/api/partner/charter", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ version: partnerCharterVersion, accepted: true }) });
      const body = await r.json(); if (!r.ok) throw new Error(body.error);
      setAcceptedAt(new Date().toISOString());
    } catch (e) { setError(e instanceof Error ? e.message : "Acceptation impossible."); }
    finally { setBusy(false); }
  }
  return <section className="my-5 rounded-2xl border border-sanispa-line bg-white p-5"><h2 className="text-xl font-bold">La charte de partenariat</h2><p className="mt-2 text-sm">Les engagements ci-dessous encadrent les missions confiées par SANISPA. Votre acceptation est enregistrée avec votre compte, sa date et la version du texte.</p>
    <div className="mt-4 grid gap-4">{partnerCharterClauses.map(c => <div key={c.title}><h3 className="font-bold">{c.title}</h3><p className="mt-1 text-sm leading-6">{c.text}</p></div>)}</div>
    {error ? <p role="alert" className="mt-3 text-red-800">{error}</p> : null}
    {acceptedAt ? <p role="status" className="mt-4 font-bold text-emerald-800">Charte acceptée le {new Date(acceptedAt).toLocaleString("fr-FR")}.</p> : <form className="mt-4 grid gap-3" onSubmit={e => { e.preventDefault(); void accept(); }}><label className="flex items-start gap-3"><input type="checkbox" checked={checked} required onChange={e => setChecked(e.target.checked)} className="mt-1" />En tant que responsable du partenaire, j’ai lu la charte et j’accepte ses engagements.</label><Button type="submit" disabled={busy || !checked}>Accepter la charte</Button></form>}
  </section>;
}
