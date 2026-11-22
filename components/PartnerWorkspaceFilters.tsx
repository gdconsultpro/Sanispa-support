"use client";

import { Button } from "@/components/Button";
import { plannerDate, plannerRange, type PlannerPeriod, type PlannerTechnician } from "@/lib/partner-planner";
import { workFilterLabels, type WorkFilterStatus, type WorkspaceSelection } from "@/lib/partner-workspace";

const fieldClass = "focus-ring mt-1 min-h-11 w-full min-w-0 rounded-lg border border-sanispa-line bg-white px-2.5 py-2 text-base font-normal";
const periods = { day: "Jour", week: "Semaine", month: "Mois" } satisfies Record<PlannerPeriod, string>;

export function PartnerWorkspaceFilters({ selection, team, disabled, onChange }: {
  selection: WorkspaceSelection; team: PlannerTechnician[]; disabled?: boolean;
  onChange: (values: Partial<WorkspaceSelection>) => void;
}) {
  const { day, period, status, technician } = selection;
  const range = plannerRange(day, period);
  const today = plannerDate(new Date());
  const dateLabel = new Intl.DateTimeFormat("fr-FR", period === "month" ? { month: "long", year: "numeric" } : { dateStyle: "medium" });

  function step(direction: number) {
    const anchor = new Date(range.from);
    if (period === "month") anchor.setMonth(anchor.getMonth() + direction);
    else anchor.setDate(anchor.getDate() + direction * (period === "week" ? 7 : 1));
    onChange({ day: plannerDate(anchor) });
  }

  return <fieldset disabled={disabled} className="my-4 min-w-0 space-y-3">
    <legend className="sr-only">Période et filtres des interventions</legend>
    <div className="flex flex-wrap items-center gap-2" aria-label="Période du planning">
      {(Object.keys(periods) as PlannerPeriod[]).map(option => <Button type="button" key={option}
        aria-pressed={period === option} variant={period === option ? "primary" : "secondary"} onClick={() => onChange({ period: option })}>
        {periods[option]}
      </Button>)}
      {day !== today ? <button type="button" className="focus-ring min-h-11 px-2 text-sm font-bold text-sanispa-blue underline" onClick={() => onChange({ day: today })}>Aujourd’hui</button> : null}
    </div>
    <div className="grid items-end gap-3 lg:grid-cols-[minmax(16rem,1.25fr)_minmax(12rem,1fr)_minmax(12rem,1fr)]">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-1.5">
        <Button type="button" variant="secondary" aria-label="Période précédente" onClick={() => step(-1)}>‹</Button>
        <label className="min-w-0 text-sm font-bold">Date du planning
          <input type="date" min="1900-01-01" max="2099-12-31" value={day} className={fieldClass}
            onChange={event => { if (event.target.value) onChange({ day: event.target.value }); }} />
        </label>
        <Button type="button" variant="secondary" aria-label="Période suivante" onClick={() => step(1)}>›</Button>
      </div>
      <label className="min-w-0 text-sm font-bold">Statut
        <select value={status} className={fieldClass} onChange={event => onChange({ status: event.target.value as WorkFilterStatus })}>
          {Object.entries(workFilterLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </select>
      </label>
      <label className="min-w-0 text-sm font-bold">Technicien
        <select value={technician} className={fieldClass} onChange={event => onChange({ technician: event.target.value })}>
          <option value="all">Toute l’équipe</option>
          <option value="">À affecter</option>
          {team.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
        </select>
      </label>
    </div>
    <p className="text-sm font-semibold capitalize">{period === "week"
      ? dateLabel.formatRange(range.from, new Date(+range.to - 1000)) : dateLabel.format(range.from)}</p>
  </fieldset>;
}
