"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ButtonLink } from "@/components/Button";
import { PartnerNavigation } from "@/components/PartnerNavigation";
import { PartnerVisitDelete } from "@/components/PartnerVisitDelete";
import { PartnerVisitUnplan } from "@/components/PartnerVisitUnplan";
import { PartnerWorkspaceFilters } from "@/components/PartnerWorkspaceFilters";
import { partnerAuthError } from "@/lib/partner-browser";
import { partnerNewVisitPath, plannerDate, plannerRange, plannerTime, type PlannerMapIntervention } from "@/lib/partner-planner";
import { plannerRequest } from "@/lib/partner-planner-browser";
import { matchesWorkFilters, readWorkspaceSelection, workItemPath, workStatusLabels, workspacePath, workspaceWorkItems,
  type PartnerWorkspaceData, type WorkspaceSelection } from "@/lib/partner-workspace";

const endpoint = "/api/partner/planning";
const actionClass = "focus-ring inline-flex min-h-11 items-center text-sm font-bold text-sanispa-blue underline";
const searchable = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export default function InterventionsPage() {
  const [selection, setSelection] = useState<WorkspaceSelection | null>(null);
  const [data, setData] = useState<PartnerWorkspaceData | null>(null);
  const [search, setSearch] = useState("");
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const day = selection?.day;
  const period = selection?.period;

  useEffect(() => {
    function readLocation() {
      setSelection({ day: plannerDate(new Date()), period: "week", status: "all", technician: "all",
        ...readWorkspaceSelection(window.location.search, window.location.hash) });
    }
    readLocation();
    window.addEventListener("popstate", readLocation);
    return () => window.removeEventListener("popstate", readLocation);
  }, []);
  useEffect(() => {
    if (!day || !period) return;
    const controller = new AbortController();
    const { from, to } = plannerRange(day, period);
    setError("");
    setData(null);
    const query = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), queue: "1" });
    void plannerRequest(endpoint + "?" + query, { signal: controller.signal }).then(result => {
      if (result && !controller.signal.aborted) setData(result);
    }).catch(error => { if (!controller.signal.aborted) setError(partnerAuthError(error)); });
    return () => controller.abort();
  }, [day, period, revision]);

  function changeSelection(changes: Partial<WorkspaceSelection>) {
    if (!selection) return;
    const next = { ...selection, ...changes };
    setSelection(next);
    window.history.replaceState(null, "", workspacePath("list", next));
  }

  async function change(item: PlannerMapIntervention, action: "unplanVisit" | "deleteVisit") {
    setSaving(true);
    setNotice("");
    try {
      const result = item.dossierId
        ? await plannerRequest("/api/partner/interventions/" + item.dossierId, {
          payload: { action: "cancel_appointment", start: item.startsAt, end: item.endsAt },
        })
        : await plannerRequest(endpoint, { payload: { action, id: item.visit!.id, expected_at: item.visit!.updated_at } });
      if (!result) throw new Error("Reconnectez-vous pour modifier l’intervention.");
      setNotice(action === "unplanVisit" ? "L’intervention est de nouveau à planifier." : "Intervention supprimée. La fiche client est conservée.");
      if (action === "unplanVisit" && selection?.status !== "all") changeSelection({ status: "pending" });
      setRevision(value => value + 1);
    } finally { setSaving(false); }
  }

  const items = useMemo(() => data ? workspaceWorkItems(data, Date.now()) : [], [data]);
  const terms = searchable(search.trim()).split(/\s+/).filter(Boolean);
  const visible = selection ? items.filter(item => matchesWorkFilters(item, selection.status, selection.technician) && terms.every(term =>
    searchable([item.title, item.reference, item.address, item.description].filter(Boolean).join(" ")).includes(term))) : [];

  return <AppShell compact>
    <PartnerNavigation current="Interventions" selection={selection ?? undefined} />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-3xl font-bold">Mes interventions</h1>
      <ButtonLink href={partnerNewVisitPath}>Nouvelle intervention</ButtonLink>
    </div>
    <section className="mt-4 min-w-0 rounded-2xl border border-sanispa-line bg-white p-4 sm:p-5" aria-label="Liste des interventions">
      {selection ? <PartnerWorkspaceFilters selection={selection} team={data?.technicians ?? []} disabled={saving} onChange={changeSelection} /> : null}
      <label className="my-3 block text-sm font-bold">Rechercher une intervention
        <input type="search" maxLength={140} value={search} onChange={event => setSearch(event.target.value)} placeholder="Client, référence, ville ou panne"
          className="focus-ring mt-1 block min-h-11 w-full rounded-lg border border-sanispa-line px-3 py-2 text-base font-normal" />
      </label>
      {selection?.status === "all" || selection?.status === "pending" ?
        <p className="mb-2 text-sm text-sanispa-steel">Les interventions à planifier sont affichées toutes dates confondues.</p> : null}
      {notice ? <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-900">{notice}</p> : null}
      {error ? <div>
        <p role="alert" className="text-red-800">{error}</p>
        <button type="button" className={actionClass} onClick={() => setRevision(value => value + 1)}>Réessayer</button>
      </div> : !data ? <p role="status">Chargement des interventions…</p> : <>
        <p className="text-sm font-bold" role="status">{visible.length} {visible.length === 1 ? "intervention" : "interventions"}</p>
        {visible.length ? <ul className="mt-2 divide-y divide-sanispa-line">
          {visible.map(item => {
            const technician = data.technicians.find(member => member.id === item.technicianId)?.name ?? "À affecter";
            const date = item.activityAt && new Date(item.activityAt).toLocaleDateString("fr-FR", { dateStyle: "medium" });
            const hours = item.startsAt && item.endsAt && plannerTime(item.startsAt) + "–" + plannerTime(item.endsAt);
            const privateEditable = item.visit && !item.visit.completed_at;
            return <li key={item.id} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="break-words text-lg font-bold">{item.title}</h2>
                {item.workStatus ? <span className="rounded-md bg-sanispa-ice px-2 py-1 text-sm font-bold">{workStatusLabels[item.workStatus]}</span> : null}
              </div>
              <p className="mt-1 text-sm text-sanispa-steel">{[item.dossierId ? "SANISPA" : "Mon entreprise", item.reference, date, hours, technician].filter(Boolean).join(" · ")}</p>
              <p className="break-words text-sm">{item.address || "Adresse à compléter"}</p>
              <div className="flex flex-wrap items-start gap-x-4">
                <Link className={actionClass} href={workItemPath(item)}>{item.dossierId && item.workStatus === "review" ? "Ouvrir le rapport" : "Ouvrir la fiche"}</Link>
                <Link className={actionClass} href={workspacePath("map", { ...selection, status: item.workStatus, technician: "all" }, item.id)}>Retrouver sur la carte</Link>
                {item.workStatus === "scheduled" && item.startsAt && Date.parse(item.startsAt) > Date.now() ?
                  <PartnerVisitUnplan disabled={saving} onUnplan={() => change(item, "unplanVisit")} /> : null}
                {privateEditable ? <PartnerVisitDelete disabled={saving} onDelete={() => change(item, "deleteVisit")} /> : null}
              </div>
            </li>;
          })}
        </ul> : <p className="mt-2">Aucune intervention pour cette sélection.</p>}
      </>}
    </section>
  </AppShell>;
}
