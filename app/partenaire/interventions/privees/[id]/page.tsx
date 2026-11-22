"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PartnerFieldVisit } from "@/components/PartnerFieldVisit";
import { PartnerNavigation } from "@/components/PartnerNavigation";

export default function PrivateInterventionPage() {
  const { id } = useParams<{ id: string }>();
  return <AppShell compact>
    <PartnerNavigation current="Interventions" />
    <Link href="/partenaire/interventions" className="font-bold underline">← Mes interventions</Link>
    <h1 className="mt-4 text-3xl font-bold">Fiche terrain</h1>
    <PartnerFieldVisit key={id} id={id} source="private" />
  </AppShell>;
}
