"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/Button";
import { partnerAuthError } from "@/lib/partner-browser";
import type { PartnerTeamLinks } from "@/lib/partner-day";
import { plannerRequest, PlannerRequestError } from "@/lib/partner-planner-browser";

const endpoint = "/api/partner/planning/team";

export function PartnerTeamAssignment({ refresh }: { refresh: number }) {
  const [open, setOpen] = useState(false);
  const [team, setTeam] = useState<PartnerTeamLinks | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void plannerRequest(endpoint, { signal: controller.signal }).then(result => {
      if (result && !controller.signal.aborted) setTeam(result);
    }).catch(cause => { if (!controller.signal.aborted) setError(partnerAuthError(cause)); });
    return () => controller.abort();
  }, [open, refresh, revision]);

  async function save(event: FormEvent<HTMLFormElement>, member: PartnerTeamLinks["accounts"][number]) {
    event.preventDefault();
    if (busy) return;
    const selected = new FormData(event.currentTarget).get("line") || null;
    if (selected === member.technician_id) return;
    setError("");
    setMessage("");
    setBusy(true);
    try {
      if (await plannerRequest(endpoint, { payload: { user_id: member.user_id, technician_id: selected, expected: member.technician_id } })) {
        setMessage("Rattachement enregistré.");
        setRevision(value => value + 1);
      }
    } catch (cause) {
      setError(partnerAuthError(cause));
      if (cause instanceof PlannerRequestError && cause.status === 409) setRevision(value => value + 1);
    } finally { setBusy(false); }
  }

  return <details className="my-4 min-w-0 rounded-xl border border-sanispa-line bg-sanispa-ice p-3 sm:p-4"
    onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="focus-ring cursor-pointer font-bold">Comptes techniciens</summary>
    <p className="mt-2 text-sm">Associez chaque compte à sa ligne du planning pour remplir sa vue « Ma journée ».</p>
    {error ? <div className="mt-2 text-sm text-red-800"><p role="alert">{error}</p>
      {!team ? <button type="button" className="min-h-11 font-bold underline" onClick={() => { setError(""); setRevision(value => value + 1); }}>Réessayer</button> : null}
    </div> : null}
    {message ? <p role="status" className="mt-2 text-sm font-bold text-emerald-800">{message}</p> : null}
    {open && !team && !error ? <p role="status" className="mt-2 text-sm">Chargement des comptes…</p> : null}
    {team && !team.accounts.length ? <p className="mt-2 text-sm">Demandez à SANISPA de créer les accès techniciens de votre entreprise.</p> : null}
    {team && !team.technicians.length ? <p className="mt-2 text-sm">Ajoutez les lignes de vos techniciens depuis la grille du planning.</p> : null}
    {team?.accounts.length ? <ul className="mt-2 divide-y divide-sanispa-line">
      {team.accounts.map(member => <li key={member.user_id} className="py-2">
        <form key={member.technician_id ?? "unlinked"} onSubmit={event => void save(event, member)}>
          <fieldset disabled={busy || !member.active && !member.technician_id} className="flex flex-wrap items-end gap-2">
            <label className="min-w-0 flex-1 text-sm font-bold">{member.name}{member.active ? "" : " · Accès désactivé"}
              <select name="line" aria-label={"Ligne du planning pour " + member.name} defaultValue={member.technician_id ?? ""}
                className="focus-ring mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-sanispa-line bg-white px-2 py-2 text-base">
                <option value="">Aucune ligne associée</option>
                {team.technicians.map(line => <option key={line.id} value={line.id}
                  disabled={(!member.active || team.accounts.some(account => account.user_id !== member.user_id && account.technician_id === line.id)) && member.technician_id !== line.id}>{line.name}</option>)}
              </select>
            </label>
            <Button type="submit" variant="secondary" aria-label={"Enregistrer le rattachement de " + member.name}>Enregistrer</Button>
          </fieldset>
        </form>
      </li>)}
    </ul> : null}
  </details>;
}
