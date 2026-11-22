"use client";

import Link from "next/link";
import { useProfessionalAccount } from "./ProfessionalAccountLink";
import { partnerDayPath } from "@/lib/partner-day";
import { partnerAccountPath } from "@/lib/partner-navigation";
import { partnerClientsPath, partnerMapPath, partnerStockPath } from "@/lib/partner-planner";
import { workspacePath, type WorkspaceSelection } from "@/lib/partner-workspace";

const links = [
  ["Accueil", "/partenaire"],
  ["Ma journée", partnerDayPath],
  ["Planning", "/partenaire/planning"],
  ["Carte", partnerMapPath],
  ["Interventions", "/partenaire/interventions"],
  ["Clients", partnerClientsPath],
  ["Stock", partnerStockPath],
  ["Demandes", "/partenaire/leads"],
  ["Visio", "/partenaire/visio"],
  ["Mon compte", partnerAccountPath],
] as const;

const fieldLinks = ["Ma journée", "Interventions", "Visio", "Mon compte"];
const localViews = { Planning: "agenda", Carte: "map", Clients: "clients", Stock: "stock" } as const;

export function PartnerNavigation({ current, selection, onWorkspaceView }: {
  current?: (typeof links)[number][0]; selection?: WorkspaceSelection;
  onWorkspaceView?: (view: typeof localViews[keyof typeof localViews]) => void;
}) {
  const access = useProfessionalAccount();
  const technician = access.status === "partner" && access.role === "technician";
  if (access.status === "checking") return null;
  const visible = technician ? links.filter(([label]) => fieldLinks.includes(label)) : links;
  return (
    <nav aria-label="Espace partenaire" className={`mb-5 grid gap-2 ${technician ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3 sm:grid-cols-5 xl:grid-cols-10"}`}>
      {visible.map(([label, href]) => (
        <Link key={href} href={label === "Planning" ? workspacePath("agenda", selection) : label === "Carte" ? workspacePath("map", selection)
          : label === "Interventions" ? workspacePath("list", selection) : href} aria-current={current === label ? "page" : undefined}
          onClick={onWorkspaceView && Object.hasOwn(localViews, label) ? event => {
            if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.button !== 0) return;
            event.preventDefault();
            onWorkspaceView(localViews[label as keyof typeof localViews]);
          } : undefined}
          className={`focus-ring grid min-h-11 place-items-center rounded-xl border px-2 py-2 text-center text-sm font-bold ${current === label ? "border-sanispa-navy bg-sanispa-navy text-white" : "border-sanispa-line bg-white text-sanispa-navy"}`}>
          {technician && label === "Interventions" ? "Mes interventions" : label}
        </Link>
      ))}
    </nav>
  );
}
