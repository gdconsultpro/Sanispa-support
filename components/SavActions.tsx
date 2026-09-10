"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { statusLabel } from "@/lib/display-labels";
export function SavActions({ id, initialNotes, initialStatus }: {
    id: string;
    initialNotes: string;
    initialStatus: string;
}) { const router = useRouter(); const [notes, setNotes] = useState(initialNotes); const options = ["en analyse", "devis envoyé", "RDV demandé", "terminé", "CLOSED"]; const [status, setStatus] = useState(options.includes(initialStatus) ? initialStatus : ""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); async function save() { setBusy(true); setError(""); try {
    const r = await fetch(`/api/admin/diagnostics/${id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, notes, next: null }) });
    if (!r.ok)
        throw new Error("Mise à jour impossible.");
    router.refresh();
}
catch (e) {
    setError((e as Error).message);
}
finally {
    setBusy(false);
} } return <div className="mt-4 grid gap-3 border-t pt-4"><label className="grid gap-2 text-sm font-bold sm:flex sm:items-center">Statut du dossier<select value={status} onChange={e => setStatus(e.target.value)} className="max-w-full rounded-md border p-2"><option value="" disabled>Choisir le nouvel état</option>{options.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}</select></label><label className="text-sm font-bold">Notes internes<textarea maxLength={10000} className="mt-2 block w-full rounded-md border p-3" value={notes} onChange={e => setNotes(e.target.value)}/></label><button disabled={busy || !status} onClick={save} className="rounded-md border p-2 font-bold disabled:opacity-50">{busy ? "Enregistrement…" : "Enregistrer le suivi"}</button>{error ? <p role="alert" className="text-red-700">{error}</p> : null}</div>; }
export function RetryNotifications() { const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); async function retry() { setBusy(true); try {
    const r = await fetch("/api/admin/notifications", { method: "POST" });
    const d = await r.json();
    if (!r.ok)
        throw new Error();
    setMessage(`${d.sent} notification(s) envoyée(s), ${d.failed} à réessayer.`);
}
catch {
    setMessage("Relance impossible.");
}
finally {
    setBusy(false);
} } return <div className="mb-4"><button disabled={busy} onClick={retry} className="rounded-md border bg-white px-4 py-2 font-bold">Relancer les e-mails en attente</button><p role="status" className="mt-2 text-sm">{message}</p></div>; }
