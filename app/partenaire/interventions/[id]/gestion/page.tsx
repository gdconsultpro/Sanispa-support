"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { InterventionWorkspace } from "@/components/InterventionWorkspace";
import { PartnerNavigation } from "@/components/PartnerNavigation";

export default function PartnerDossierManagementPage() {
  const { id } = useParams<{ id: string }>();
  return <AppShell compact>
    <PartnerNavigation current="Interventions" />
    <Link href={`/partenaire/interventions/${id}`} className="font-bold underline">← Fiche terrain</Link>
    <h1 className="mt-4 text-3xl font-bold">Gestion du dossier SANISPA</h1>
    <InterventionWorkspace id={id} role="partner" />
  </AppShell>;
}
