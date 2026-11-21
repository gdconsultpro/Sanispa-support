import Link from "next/link";
import { PartnerNavigation } from "@/components/PartnerNavigation";
import { AppShell } from "@/components/AppShell";
import { VideoAssistance } from "@/components/VideoAssistance";
export default function PartnerVideoPage() {
  return <AppShell>
    <PartnerNavigation current="Visio" /><Link href="/partenaire" className="text-sm font-bold underline">← Espace partenaire</Link><h1 className="mt-5 text-3xl font-bold sm:text-4xl">Assistance technique en visio</h1><p className="mt-4 max-w-3xl leading-7 text-sanispa-steel">Un accompagnement SANISPA pour vous aider à avancer sur un dépannage.</p><VideoAssistance audience="partner" /></AppShell>;
}
