import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { CareDashboard } from "@/components/CareDashboard";
export default function CarePage() {
  return <AppShell compact><Link href="/premium" className="font-bold underline">← SANISPA Premium</Link><h1 className="mt-5 text-3xl font-bold">Le carnet de mon spa</h1><p className="mt-3">Entretiens, rappels et relevés : retrouvez vos repères au même endroit.</p><CareDashboard /></AppShell>;
}
