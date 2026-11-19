"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { InterventionWorkspace } from "@/components/InterventionWorkspace";
export default function ClientInterventionPage() {
  const { id } = useParams<{ id: string }>();
  return <AppShell compact><Link href="/espace-client" className="font-bold underline">← Mon espace client</Link>
    <h1 className="mt-5 text-3xl font-bold">Mon intervention, étape par étape</h1>
    <InterventionWorkspace id={id} role="client" /></AppShell>;
}
