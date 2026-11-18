import type { Metadata } from "next";
import { DemoApp } from "@/components/demo/DemoApp";
import { demoView } from "@/lib/demo";

export const metadata: Metadata = { title: "SANISPA — Explorer les trois espaces", description: "Essayez les espaces client, partenaire et administration avec des données fictives.", robots: { index: false, follow: false } };
export default async function DemoPage({ searchParams }: { searchParams?: Promise<{ espace?: string; onglet?: string }> }) {
  const params = await searchParams;
  const view = demoView(params?.espace, params?.onglet);
  return <DemoApp initialRole={view.role} initialTab={view.tab} />;
}
