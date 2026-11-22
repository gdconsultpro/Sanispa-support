"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button, ButtonLink } from "@/components/Button";
import { planningLocalParts } from "@/lib/partner-availability";
import { partnerAuthError } from "@/lib/partner-browser";
import { maintenanceDate, maintenanceUnits, type SpaMaintenanceView } from "@/lib/partner-maintenance";
import { plannerRequest, PlannerRequestError } from "@/lib/partner-planner-browser";
import { partnerPrivateVisitPath } from "@/lib/partner-planner";

const input = "focus-ring mt-1 min-h-11 w-full min-w-0 rounded-lg border border-sanispa-line bg-white px-2.5 py-2 text-base";
const dateAndTime = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" });

export function PartnerSpaMaintenance({ endpoint, clientId, spaId }: { endpoint: string; clientId: string; spaId: string }) {
  const [data, setData] = useState<SpaMaintenanceView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ section: "maintenance", client: clientId, spa: spaId });
    void plannerRequest(endpoint + "?" + params, { signal: controller.signal }).then(result => {
      if (!controller.signal.aborted && result) setData(result);
    }).catch(cause => { if (!controller.signal.aborted) setError(partnerAuthError(cause)); });
    return () => controller.abort();
  }, [endpoint, clientId, spaId, revision]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    const values = new FormData(event.currentTarget);
    try {
      const result = await plannerRequest(endpoint, { payload: {
        action: "saveMaintenance", client_id: clientId, spa_id: spaId, expected_at: data?.plan?.updated_at ?? null,
        frequency: Number(values.get("frequency")), unit: values.get("unit"),
        next_due_on: values.get("next_due_on"), active: values.get("active") === "on",
      } });
      if (result) {
        setData(result);
        setNotice("Plan d’entretien enregistré.");
      }
    } catch (cause) {
      setError(partnerAuthError(cause));
      if (cause instanceof PlannerRequestError && cause.status === 409) setRevision(value => value + 1);
    } finally { setBusy(false); }
  }

  const plan = data?.plan;
  const upcoming = data?.upcoming;
  return <section className="mt-2 min-w-0 rounded-xl border border-sanispa-line bg-sanispa-ice p-3">
    <h4 className="font-bold">Entretien récurrent du spa</h4>
    {data ? <>
      <p className="mt-1 text-sm">À l’échéance, l’intervention rejoint « À planifier ». Vous choisissez ensuite le créneau.</p>
      {upcoming ? <div className="mt-3 rounded-lg bg-white p-2.5">
        <p className="text-sm font-bold">Entretien du {maintenanceDate(upcoming.maintenance_due_on)}</p>
        <p className="text-sm">{upcoming.starts_at ? "Rendez-vous le " + dateAndTime.format(new Date(upcoming.starts_at)) : "En attente d’un créneau"}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {!upcoming.starts_at ? <a href="/partenaire/planning?statut=pending"
            className="focus-ring inline-flex min-h-12 items-center rounded-full border border-sanispa-line bg-white px-5 py-3 text-sm font-bold text-sanispa-navy hover:border-sanispa-blue">
            Voir dans À planifier
          </a> : null}
          <ButtonLink variant="secondary" href={partnerPrivateVisitPath(upcoming.id)}>Ouvrir l’intervention</ButtonLink>
        </div>
      </div> : null}
      <form key={plan?.updated_at ?? "new"} className="mt-3" onSubmit={save}>
        <fieldset disabled={busy} className="grid min-w-0 gap-2 sm:grid-cols-2">
          <label className="min-w-0 text-sm font-bold">Répéter tous les
            <input name="frequency" type="number" min={1} max={365} step={1} inputMode="numeric" defaultValue={plan?.frequency ?? 1}
              required className={input} />
          </label>
          <label className="min-w-0 text-sm font-bold">Unité de fréquence
            <select name="unit" defaultValue={plan?.unit ?? "month"} className={input}>
              {Object.entries(maintenanceUnits).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="min-w-0 text-sm font-bold">Prochaine échéance
            <input name="next_due_on" type="date" min="1900-01-01" max="2099-12-31"
              defaultValue={plan?.next_due_on ?? planningLocalParts(new Date().toISOString()).day} required className={input} />
          </label>
          <label className="flex min-h-11 items-center gap-2 self-end text-sm font-bold">
            <input type="checkbox" name="active" defaultChecked={plan?.active ?? true} /> Activer la récurrence
          </label>
          <div className="sm:col-span-2"><Button type="submit">{busy ? "Enregistrement…" : "Enregistrer le plan d’entretien"}</Button></div>
        </fieldset>
      </form>
      {upcoming ? <p className="mt-2 text-sm">Vous pouvez mettre les échéances suivantes en pause. L’intervention déjà créée reste dans votre planning.</p> : null}
    </> : !error ? <p role="status" className="mt-2 text-sm">Chargement du plan d’entretien…</p> : null}
    {error ? <div className="mt-2 text-sm text-red-800">
      <p role="alert">{error}</p>
      {!data ? <button type="button" className="focus-ring min-h-11 font-bold underline" onClick={() => {
        setError(""); setRevision(value => value + 1);
      }}>Réessayer</button> : null}
    </div> : null}
    {notice ? <p role="status" className="mt-2 text-sm font-bold text-emerald-800">{notice}</p> : null}
  </section>;
}
