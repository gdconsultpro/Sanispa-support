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
    <nav aria-label="Espace partenaire" className={`partner-navigation mb-5 grid gap-1 rounded-xl p-1.5 ${technician ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3 sm:grid-cols-5 xl:grid-cols-10"}`}>
      {visible.map(([label, href]) => (
        <Link key={href} href={label === "Planning" ? workspacePath("agenda", selection) : label === "Carte" ? workspacePath("map", selection)
          : label === "Interventions" ? workspacePath("list", selection) : href} aria-current={current === label ? "page" : undefined}
          onClick={onWorkspaceView && Object.hasOwn(localViews, label) ? event => {
            if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.button !== 0) return;
            event.preventDefault();
            onWorkspaceView(localViews[label as keyof typeof localViews]);
          } : undefined}
          className="grid min-h-11 min-w-0 place-items-center break-words rounded-md px-1.5 py-2 text-center text-xs font-bold text-[#e2eef5] sm:px-2 sm:text-sm">
          {technician && label === "Interventions" ? "Mes interventions" : label}
        </Link>
      ))}
    </nav>
  );
}
