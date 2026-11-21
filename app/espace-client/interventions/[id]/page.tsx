"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { InterventionWorkspace } from "@/components/InterventionWorkspace";
export default function ClientInterventionPage() {
  const { id } = useParams<{ id: string }>();
  return <AppShell compact><Link href="/espace-client?view=demandes" className="font-bold underline">← Mes demandes</Link>
    <h1 className="mt-5 text-3xl font-bold">Suivi de ma demande</h1>
    <InterventionWorkspace id={id} role="client" /></AppShell>;
}
