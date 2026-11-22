import type { SupabaseClient } from "@supabase/supabase-js";

export type SpaManual = {
  id: string;
  brand: string;
  model: string;
  title: string;
  source_url: string;
  source_kind: string;
};

export async function frenchSpaManuals(supabase: SupabaseClient) {
  const result = await supabase.from("spa_manuals")
    .select("id,brand,model,title,source_url,source_kind,language,verified_at")
    .eq("active", true).eq("language", "fr").order("brand").limit(300);
  if (result.error) throw result.error;
  return result.data;
}

function words(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();
}

export function findManualsByReference(manuals: SpaManual[], message: string) {
  const query = words(message);
  const matches = manuals.flatMap(manual => manual.model.split("/").flatMap(label => {
    const reference = words(label.split(/ [—–] /, 1)[0]).replaceAll(" ", "");
    // Series names and the control pack alone can refer to several keypads.
    if (!/\d/.test(reference)) return [];
    const pattern = new RegExp(`(?:^| )(${[...reference].join(" *")})(?= |$)`, "g");
    return Array.from(query.matchAll(pattern), match => ({
      manual, start: match.index + match[0].length - match[1].length, end: match.index + match[0].length,
    }));
  }));
  // For a spaced suffix such as “TP500 S”, discard the shorter overlapping match.
  return Array.from(new Set(matches.filter(match => !matches.some(other =>
    other.start === match.start && other.end > match.end,
  )).map(match => match.manual)));
}

const shortManualRequest = /^(?:je (?:voudrais|veux) )?(?:la |une )?(?:notice|manuel|guide|pdf)(?: (?:svp|s il vous plait))?$/;

export function manualAnswer(manuals: SpaManual[], message: string, previousMessages: string[]) {
  let matches = findManualsByReference(manuals, message);
  if (shortManualRequest.test(words(message))) {
    // Reuse the latest substantive message. An older model may no longer be the one sought.
    const previous = previousMessages.find(text => {
      const query = words(text);
      return query !== "oui" && query !== "merci" && !shortManualRequest.test(query);
    });
    if (previous) matches = findManualsByReference(manuals, previous);
    else return "Quelle référence est inscrite sur le clavier ? Par exemple TP500S ou in.k300. Vous pouvez aussi comparer les modèles avec les photos de la rubrique Notices.";
  }
  if (!matches.length) {
    return "Je n’ai pas trouvé de notice en français vérifiée qui corresponde à votre message. Si la référence exacte a déjà été donnée, le catalogue ne contient pas de correspondance. Vous pouvez comparer votre clavier aux photos de la rubrique Notices ou demander le document à SANISPA.";
  }
  return [
    "Voici la documentation en français pour cette référence. Vérifiez la version indiquée sur la fiche.",
    ...matches.slice(0, 5).map(manual => `${manual.brand} · ${manual.title}\n/premium/notices?ref=${manual.id}`),
  ].join("\n\n");
}

export function isManualLink(line: string) {
  return /^\/premium\/notices\?ref=[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(line);
}

export function filterSpaManuals(manuals: SpaManual[], query: string) {
  if (!query.trim()) return manuals;
  const byReference = findManualsByReference(manuals, query);
  if (byReference.length) return byReference;
  const normalized = words(query);
  return manuals.filter(manual => words(`${manual.brand} ${manual.model} ${manual.title}`).includes(normalized));
}
