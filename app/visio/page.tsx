import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { VideoAssistance } from "@/components/VideoAssistance";
export default async function VideoPage({ searchParams }: { searchParams: Promise<{ diagnosticId?: string }> }) {
  const { diagnosticId } = await searchParams;
  return <AppShell><Link href="/espace-client" className="text-sm font-bold underline">← Mon espace client</Link><h1 className="mt-5 text-3xl font-bold sm:text-4xl">Votre dépannage en visio</h1><p className="mt-4 max-w-3xl leading-7 text-sanispa-steel">Vous avez terminé votre prédiagnostic et souhaitez être guidé ? Demandez un rendez-vous de 30 minutes avec SANISPA.</p><VideoAssistance audience="customer" diagnosticId={diagnosticId} /></AppShell>;
}
