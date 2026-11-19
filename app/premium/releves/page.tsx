import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { CareDashboard } from "@/components/CareDashboard";
export default function ReadingsPage() {
 return <AppShell compact><Link href="/premium" className="font-bold underline">← Mon espace spa</Link><h1 className="mt-5 text-3xl font-bold">Mes relevés d’eau</h1><p className="mt-3">Ajoutez vos mesures et retrouvez leur historique. Vous pouvez transmettre un relevé à votre assistant.</p><CareDashboard view="releves" /></AppShell>;
}
