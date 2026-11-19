import { Suspense } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PremiumAssistant } from "@/components/PremiumAssistant";
export default function AssistantPage() {
  return <AppShell compact><Link href="/premium" className="font-bold underline">← Mes services SANISPA</Link><h1 className="mt-5 text-3xl font-bold">Mon assistant spa</h1><p className="mt-3">Une aide pour comprendre et avancer, sans garantie de diagnostic ni de réparation.</p><Suspense fallback={<p>Chargement…</p>}><PremiumAssistant /></Suspense></AppShell>;
}
