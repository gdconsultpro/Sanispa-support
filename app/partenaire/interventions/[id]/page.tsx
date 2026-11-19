"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { InterventionWorkspace } from "@/components/InterventionWorkspace";
export default function PartnerInterventionPage() {
  const { id } = useParams<{ id: string }>();
  return <AppShell compact><Link href="/partenaire/interventions" className="font-bold underline">← Mes interventions</Link>
    <h1 className="mt-5 text-3xl font-bold">Le suivi de mon intervention</h1>
    <InterventionWorkspace id={id} role="partner" /></AppShell>;
}
