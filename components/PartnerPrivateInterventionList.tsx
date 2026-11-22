"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { PartnerVisitDelete } from "@/components/PartnerVisitDelete";
import { partnerAuthError, partnerToken, redirectPartnerAccess } from "@/lib/partner-browser";
import { partnerClientAddress, partnerVisitMapPath, plannerTime, type PlannerTechnician, type PrivatePartnerClient } from "@/lib/partner-planner";

type VisitListItem = {
  id: string; title: string; starts_at: string | null; ends_at: string | null; technician_id: string | null; updated_at: string;
  client: Pick<PrivatePartnerClient, "name" | "street" | "postal_code" | "city">;
};
type VisitPage = { visits: VisitListItem[]; technicians: PlannerTechnician[]; more: boolean };
const returnPath = "/partenaire/interventions";
const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

export function PartnerPrivateInterventionList() {
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState<VisitPage | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setPage(null);
    setError("");
    async function load() {
      const token = await partnerToken(returnPath);
      if (!token || controller.signal.aborted) return;
      const query = new URLSearchParams({ section: "visits", name: search, offset: String(offset) });
      const response = await fetch("/api/partner/planning?" + query, {
        headers: { Authorization: "Bearer " + token }, signal: controller.signal, cache: "no-store",
      });
      if (redirectPartnerAccess(response, returnPath)) return;
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (!controller.signal.aborted) setPage(result);
    }
    void load().catch(cause => { if (!controller.signal.aborted) setError(partnerAuthError(cause)); });
    return () => controller.abort();
  }, [search, offset, attempt]);

  async function remove(visit: VisitListItem) {
    setNotice("");
    const token = await partnerToken(returnPath);
    if (!token) throw new Error("Reconnectez-vous pour supprimer l’intervention.");
    const response = await fetch("/api/partner/planning", {
      method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deleteVisit", id: visit.id, expected_at: visit.updated_at }),
      signal: AbortSignal.timeout(20000),
    });
    if (redirectPartnerAccess(response, returnPath)) return;
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "L’intervention est temporairement indisponible.");
    setNotice("Intervention supprimée. La fiche client est conservée.");
    if (page?.visits.length === 1 && offset > 0) setOffset(value => value - 30);
    else setAttempt(value => value + 1);
  }

  return <section aria-labelledby="private-interventions" className="mt-5 rounded-2xl border border-sanispa-line bg-white p-4 sm:p-5">
    <h2 id="private-interventions" className="text-xl font-bold">Interventions de mon entreprise</h2>
    <form className="my-3 flex flex-wrap items-end gap-2" onSubmit={event => {
      event.preventDefault();
      setOffset(0);
      setSearch(String(new FormData(event.currentTarget).get("name") ?? "").trim());
    }}>
      <label className="min-w-0 flex-1 text-sm font-bold">Rechercher par nom du client
        <input type="search" name="name" maxLength={140} className="focus-ring mt-1 min-h-12 w-full min-w-0 rounded-lg border border-sanispa-line bg-white px-3 text-base" />
      </label>
      <Button type="submit" variant="secondary">Rechercher</Button>
    </form>
    {notice ? <p role="status" className="mb-3 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-900">{notice}</p> : null}
    {error ? <div><p role="alert" className="text-sm font-bold text-red-800">{error}</p>
      <button type="button" className="focus-ring min-h-11 font-bold underline" onClick={() => setAttempt(value => value + 1)}>Réessayer</button>
    </div> : !page ? <p role="status">Chargement des interventions…</p>
      : !page.visits.length ? <p>{search ? "Aucune intervention pour ce client." : "Vous pouvez créer votre première intervention depuis cette page."}</p>
      : <ul className="divide-y divide-sanispa-line">
        {page.visits.map(visit => {
          const specialist = page.technicians.find(member => member.id === visit.technician_id)?.name ?? "À affecter";
          const slot = visit.starts_at
            ? date.format(new Date(visit.starts_at)) + " · " + plannerTime(visit.starts_at) + (visit.ends_at ? "–" + plannerTime(visit.ends_at) : "")
            : "À planifier · Sans date";
          return <li key={visit.id} className="py-3">
            <h3 className="break-words font-bold">{visit.client.name} · {visit.title}</h3>
            <p className="mt-1 text-sm font-semibold">{slot} · {specialist}</p>
            <p className="break-words text-sm">{partnerClientAddress(visit.client) || "Adresse à compléter"}</p>
            <div className="flex flex-wrap items-start gap-x-4">
              <Link className="focus-ring inline-flex min-h-11 items-center text-sm font-bold text-sanispa-blue underline"
                href={partnerVisitMapPath(visit.id, visit.starts_at)}>Retrouver sur la carte</Link>
              <PartnerVisitDelete onDelete={() => remove(visit)} />
            </div>
          </li>;
        })}
      </ul>}
    {page && (offset > 0 || page.more) ? <div className="mt-3 flex flex-wrap gap-2">
      <Button type="button" variant="secondary" disabled={!offset} onClick={() => setOffset(value => value - 30)}>Précédent</Button>
      <Button type="button" variant="secondary" disabled={!page.more} onClick={() => setOffset(value => value + 30)}>Suivant</Button>
    </div> : null}
  </section>;
}
