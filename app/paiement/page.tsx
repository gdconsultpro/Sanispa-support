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
    const [resume, setResume] = useState("");
    const plan = remotePlans.find(p => p.id === "water" && p.enabled);
    useEffect(() => { setId(new URLSearchParams(window.location.search).get("diagnosticId") || readDraft().diagnosticId || ""); async function load() { try {
        const r = await fetch("/api/water-session", { method: "POST", headers: { "Content-Type": "application/json", ...await authHeaders() }, body: "{}" });
        const d = await r.json();
        if (d.active)
            setResume(d.resumeUrl);
    }
    catch {
        setError("Connectez-vous pour retrouver votre paiement.");
    } } void load(); }, []);
    async function pay() { setBusy(true); setError(""); try {
        if (resume) {
            window.location.href = resume;
            return;
        }
        const r = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json", ...await authHeaders() }, body: JSON.stringify({ diagnosticId: id, paymentPlan: "water" }) });
        const d = await r.json();
        if (!r.ok)
            throw new Error(d.error);
        window.location.href = d.url;
    }
    catch (e) {
        setError(e instanceof Error ? e.message : "Paiement indisponible.");
    }
    finally {
        setBusy(false);
    } }
    return <AppShell compact><section className="rounded-md bg-white p-6"><h1 className="text-2xl font-bold">{resume ? "Votre assistance eau est active" : "Votre assistance eau"}</h1><p className="my-4">{resume ? "Reprenez votre accompagnement sans repayer." : `${plan?.name || "Diagnostic eau"} · ${plan?.price || "—"} €`}</p><p className="my-4 text-sm">Conseils à partir de vos valeurs et de votre description. L'assistant ne garantit pas la résolution du problème.</p>{error ? <p role="alert" className="my-4 text-red-700">{error}</p> : null}<Button disabled={busy || (!resume && !id)} onClick={pay}>{busy ? "Vérification…" : resume ? "Reprendre mon assistance" : "Payer avec Stripe"}</Button><Link href="/espace-client" className="mt-5 block underline">Retour à mon espace client</Link></section></AppShell>;
}
