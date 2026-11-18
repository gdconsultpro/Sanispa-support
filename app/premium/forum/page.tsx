import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PremiumForum } from "@/components/PremiumForum";
export default function ForumPage() {
  return <AppShell compact><Link href="/premium" className="font-bold underline">← SANISPA Premium</Link><h1 className="mt-5 text-3xl font-bold">Le forum des particuliers</h1><p className="mt-3">Partagez votre expérience avec d’autres propriétaires. Gilles modère les échanges avant publication. Les partenaires ne peuvent pas y intervenir.</p><PremiumForum /></AppShell>;
}
