import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { CareDashboard } from "@/components/CareDashboard";
export default function CarePage() {
  return <AppShell compact><Link href="/espace-client?view=entretien" className="font-bold underline">← Mon entretien</Link><h1 className="mt-5 text-3xl font-bold">Le carnet de mon spa</h1><p className="mt-3">Ajoutez vos entretiens et programmez vos rappels dans vos tableaux de suivi.</p><CareDashboard /></AppShell>;
}
