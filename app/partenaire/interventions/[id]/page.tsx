"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PartnerNavigation } from "@/components/PartnerNavigation";
import { AppShell } from "@/components/AppShell";
import { PartnerFieldVisit } from "@/components/PartnerFieldVisit";
export default function PartnerInterventionPage() {
  const { id } = useParams<{ id: string }>();
  return <AppShell compact>
    <PartnerNavigation current="Interventions" /><Link href="/partenaire/interventions" className="font-bold underline">← Mes interventions</Link>
    <h1 className="mt-5 text-3xl font-bold">Fiche terrain SANISPA</h1>
    <PartnerFieldVisit key={id} id={id} source="sanispa" /></AppShell>;
}
