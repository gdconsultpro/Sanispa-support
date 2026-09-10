"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { authHeaders, readDraft } from "@/lib/storage";
import { remotePlans } from "@/lib/questions";
export default function Payment() {
  const [id, setId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [cancelled, setCancelled] = useState(false);
  const [resume, setResume] = useState("");
  const plan = remotePlans.find(p => p.id === "water" && p.enabled);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const diagnosticId = params.get("diagnosticId") || readDraft().diagnosticId || "";
    setId(diagnosticId); setCancelled(params.get("cancelled") === "1");
    async function load() {
      try {
        const r = await fetch("/api/water-session", { method: "POST", headers: { "Content-Type": "application/json", ...await authHeaders() }, body: JSON.stringify(diagnosticId ? {diagnosticId} : {}) });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Vérification indisponible.");
        if (d.active) setResume(d.resumeUrl);
      } catch (e) { setError(e instanceof Error ? e.message : "Connectez-vous pour retrouver votre paiement."); }
      finally { setChecking(false); }
    }
    void load();
  }, []);
  async function pay() {
    setBusy(true); setError("");
    try {
      if (resume) { window.location.href = resume; return; }
      const r = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json", ...await authHeaders() }, body: JSON.stringify({ diagnosticId: id, paymentPlan: "water" }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      window.location.href = d.url;
    } catch (e) { setError(e instanceof Error ? e.message : "Paiement indisponible."); }
    finally { setBusy(false); }
  }
  return <AppShell compact><section className="rounded-md bg-white p-6">
    <h1 className="text-2xl font-bold">{resume ? "Votre assistance eau est active" : "Votre assistance eau"}</h1>
    {cancelled && !resume && <p role="status" className="my-4 rounded-md bg-amber-50 p-3">Le paiement n’a pas été finalisé. Votre dossier est conservé ; vous pouvez réessayer.</p>}
    <p className="my-4">{resume ? "Reprenez votre accompagnement sans repayer." : `${plan?.name || "Diagnostic eau"} · ${plan?.price || "—"} €`}</p>
    <p className="my-4 text-sm">Conseils à partir de vos valeurs et de votre description. L’assistant ne garantit pas la résolution du problème.</p>
    {error && <p role="alert" className="my-4 text-red-700">{error}</p>}
    {!id && !resume && !checking && <p className="my-4">Choisissez un dossier depuis votre espace client pour poursuivre.</p>}
    <Button disabled={busy || checking || (!resume && !id)} onClick={pay}>{busy || checking ? "Vérification…" : resume ? "Reprendre mon assistance" : "Payer avec Stripe"}</Button>
    <Link href="/espace-client" className="mt-5 block underline">Retour à mon espace client</Link>
  </section></AppShell>;
}
