"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { restoreDraft } from "@/lib/storage";
export default function ResumeDraft() { const [error, setError] = useState(""); useEffect(() => { const id = new URLSearchParams(window.location.search).get("id"); if (!id) {
    setError("Sélectionnez un diagnostic dans votre espace client.");
    return;
} restoreDraft(id).then(result => window.location.replace(result.step), e => setError(e.message)); }, []); return <AppShell compact><h1 className="text-2xl font-bold">Reprise de votre diagnostic</h1><p className="mt-3" role="status">{error || "Récupération de votre saisie…"}</p>{error ? <Link href="/espace-client" className="mt-4 block underline">Mon espace client</Link> : null}</AppShell>; }
