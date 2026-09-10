import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminActivity = {
  id: string;
  diagnostic_id: string;
  created_at: string;
  actor: string | null;
  status: string | null;
  event_type: string | null;
  old_status: string | null;
  metadata: Record<string, unknown> | null;
};

export type AdminClientDocument = {
  id: string;
  user_id: string;
  file_name: string;
  document_type: string | null;
  created_at: string | null;
  diagnostic_id: string | null;
  spa_id: string | null;
};

export type AdminDossierDetails = {
  activity: AdminActivity[];
  documents: AdminClientDocument[];
  historyError: string | null;
  documentsError: string | null;
};

export function hasOverdueAction(dossier: {
  archived_at: string | null;
  status: string;
  next_action_state: string | null;
  next_action_at: string | null;
}, now = Date.now()) {
  return !dossier.archived_at && !["terminé", "CLOSED"].includes(dossier.status) &&
    dossier.next_action_state === "pending" && Boolean(dossier.next_action_at) &&
    new Date(dossier.next_action_at!).getTime() <= now;
}

export function documentsForDossier(
  dossier: { id: string; user_id: string | null },
  documents: AdminClientDocument[],
) {
  return documents.filter(document => document.diagnostic_id === dossier.id ||
    (Boolean(dossier.user_id) && document.user_id === dossier.user_id));
}

/** Called only after the administrator session has been checked on the server. */
export async function loadAdminDossierDetails(
  supabase: SupabaseClient,
  dossiers: Array<{ id: string; user_id: string | null }>,
): Promise<Map<string, AdminDossierDetails>> {
  const result = new Map<string, AdminDossierDetails>();
  if (!dossiers.length) return result;
  const ids = dossiers.map(dossier => dossier.id);
  const userIds = [...new Set(dossiers.flatMap(dossier => dossier.user_id ? [dossier.user_id] : []))];
  // Keep full chronologies rather than silently stopping at the Data API row limit.
  async function readRows<T>(table: string, columns: string, field: string, values: string[]): Promise<T[]> {
    const rows: T[] = [];
    for (let offset = 0; offset < values.length; offset += 100) {
      const group = values.slice(offset, offset + 100);
      for (let page = 0; ; page += 500) {
        const { data, error } = await supabase.from(table).select(columns).in(field, group)
          .order("created_at", { ascending: false, nullsFirst: false }).order("id", { ascending: false })
          .range(page, page + 499);
        if (error) throw error;
        rows.push(...((data ?? []) as unknown as T[]));
        if (!data || data.length < 500) break;
      }
    }
    return rows;
  }
  const documentColumns = "id,user_id,file_name,document_type,created_at,diagnostic_id,spa_id";
  const [history, clientDocuments, dossierDocuments] = await Promise.allSettled([
    readRows<AdminActivity>("diagnostic_activity", "id,diagnostic_id,created_at,actor,status,event_type,old_status,metadata", "diagnostic_id", ids),
    readRows<AdminClientDocument>("client_documents", documentColumns, "user_id", userIds),
    readRows<AdminClientDocument>("client_documents", documentColumns, "diagnostic_id", ids),
  ]);
  const activity = history.status === "fulfilled" ? history.value : [];
  const documents = [...new Map([...(clientDocuments.status === "fulfilled" ? clientDocuments.value : []),
    ...(dossierDocuments.status === "fulfilled" ? dossierDocuments.value : [])].map(document => [document.id, document])).values()]
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  for (const dossier of dossiers) result.set(dossier.id, {
    activity: activity.filter(event => event.diagnostic_id === dossier.id),
    documents: documentsForDossier(dossier, documents),
    historyError: history.status === "rejected" ? "L’historique n’a pas pu être chargé. Actualisez la page pour réessayer." : null,
    documentsError: clientDocuments.status === "rejected" || dossierDocuments.status === "rejected"
      ? "La liste des documents n’a pas pu être chargée complètement. Actualisez la page pour réessayer." : null,
  });
  return result;
}
