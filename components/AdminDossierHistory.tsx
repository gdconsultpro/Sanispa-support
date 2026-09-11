import { statusLabel } from "@/lib/display-labels";
import type { AdminActivity } from "@/lib/admin-dossier";

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" }).format(date)
    : "Date non renseignée";
}

function eventLabel(item: AdminActivity) {
  if (!item.event_type) return `Statut enregistré : ${statusLabel(item.status)}`;
  if (item.event_type === "partner_released" && typeof item.metadata?.company_name === "string") return `Diffusion autorisée vers ${item.metadata.company_name}`;
  if (item.event_type === "status_changed") {
    return "Statut modifié";
  }
  const labels: Record<string, string> = {
    partner_kept: "Dossier conservé chez SANISPA · aucune diffusion partenaire",
    partner_released: "Diffusion validée par SANISPA vers le partenaire sélectionné",
    partner_assigned: "Prise en charge gratuite par un partenaire",
    notes_updated: "Notes internes modifiées",
    action_created: "Action créée",
    action_updated: "Action modifiée",
    action_completed: "Action marquée comme réalisée",
    action_cancelled: "Action annulée"
  };
  return labels[item.event_type] || "Événement de suivi enregistré";
}

function actorLabel(item: AdminActivity & { actor_name?: string | null }) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const name = item.actor_name?.trim();
  if (name && !uuid.test(name)) return name;
  const actor = item.actor?.trim();
  return actor && !uuid.test(actor) ? actor : "Auteur non renseigné";
}

function actionDetails(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value as Record<string, unknown>;
  const text = typeof snapshot.text === "string" ? snapshot.text : null;
  const dueAt = typeof snapshot.dueAt === "string" ? snapshot.dueAt : null;
  const states: Record<string, string> = { pending: "À réaliser", done: "Réalisée", cancelled: "Annulée" };
  const state = typeof snapshot.state === "string" ? states[snapshot.state] : undefined;
  if (!text && !dueAt && !state) return null;
  return <>
    {text ? <p className="whitespace-pre-wrap break-words">{text}</p> : null}
    {dueAt ? <p className="mt-1">Échéance : {dateLabel(dueAt)}</p> : null}
    {state ? <p className="mt-1">État : {state}</p> : null}
  </>;
}

export function AdminDossierHistory({ activity, error }: {
  activity: AdminActivity[];
  error?: string | null;
}) {
  const ordered = [...activity].sort((left, right) => {
    const first = Date.parse(left.created_at);
    const second = Date.parse(right.created_at);
    return (Number.isFinite(first) ? first : Infinity) - (Number.isFinite(second) ? second : Infinity);
  });

  return <section className="min-w-0">
    <h3 className="font-bold text-sanispa-navy">Historique du dossier</h3>
    <p className="mt-1 text-xs text-sanispa-steel">Du plus ancien au plus récent. Dates et échéances affichées à l’heure de Paris.</p>
    {error ? <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p> : null}
    {!activity.length && !error ? <p className="mt-3 text-sm text-sanispa-steel">Aucun événement de suivi enregistré.</p> : null}
    {ordered.length ? <ol className="mt-3 divide-y divide-sanispa-line rounded-md border border-sanispa-line">
      {ordered.map(item => {
        const before = item.event_type?.startsWith("action_") ? actionDetails(item.metadata?.before)
          : item.event_type === "status_changed" && item.old_status ? <p>{statusLabel(item.old_status)}</p> : null;
        const after = item.event_type?.startsWith("action_") ? actionDetails(item.metadata?.after)
          : item.event_type === "status_changed" && item.status ? <p>{statusLabel(item.status)}</p> : null;
        return <li key={item.id} className="min-w-0 p-3 text-sm text-sanispa-steel sm:p-4">
          <div className="grid min-w-0 gap-1 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-x-4">
            <p className="text-xs leading-5">{dateLabel(item.created_at)}</p>
            <div className="min-w-0">
              <p className="font-bold text-sanispa-navy">{eventLabel(item)}</p>
              <p className="mt-0.5 break-words text-xs">{actorLabel(item)}</p>
            </div>
          </div>
          {before || after ? <details className="mt-2 min-w-0 sm:ml-44">
            <summary className="focus-ring w-fit cursor-pointer rounded text-xs font-bold text-sanispa-blue">Voir les détails de la modification</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {before ? <div className="min-w-0 rounded-md bg-sanispa-ice p-3"><p className="mb-1 font-bold text-sanispa-navy">Avant</p>{before}</div> : null}
              {after ? <div className="min-w-0 rounded-md bg-sanispa-ice p-3"><p className="mb-1 font-bold text-sanispa-navy">Après</p>{after}</div> : null}
            </div>
          </details> : null}
        </li>;
      })}
    </ol> : null}
  </section>;
}
