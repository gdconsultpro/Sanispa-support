"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { authHeaders, clearDraft } from "@/lib/storage";
export default function Confirmation() { const [id, setId] = useState(""); const [message, setMessage] = useState("Vérification de votre dossier…"); useEffect(() => { async function load() { try {
    const requested = new URLSearchParams(window.location.search).get("id");
    const response = await fetch("/api/client/dashboard", { headers: await authHeaders() });
    if (!response.ok)
        throw new Error();
    const data = await response.json();
    if (!requested || !data.diagnostics.some((d: {
        id: string;
    }) => d.id === requested))
        throw new Error();
    setId(requested);
    setMessage("Votre demande a bien été envoyée à SANISPA et enregistrée. Retrouvez son état et votre résumé PDF dans votre espace client.");
    clearDraft();
}
catch {
    setMessage("Retrouvez l'état de vos demandes dans votre espace client.");
} } void load(); }, []); return <AppShell compact><section className="rounded-md bg-white p-6 text-center"><h1 className="text-2xl font-bold">{id ? "Demande enregistrée" : "Votre demande SANISPA"}</h1><p className="mt-4">{message}</p>{id ? <p className="mt-3 font-bold">Dossier n°{id.slice(0, 8).toUpperCase()}</p> : null}<Link href="/espace-client" className="mt-5 inline-block rounded-md bg-sanispa-navy px-5 py-3 font-bold text-white">Accéder à mon espace client</Link></section></AppShell>; }
