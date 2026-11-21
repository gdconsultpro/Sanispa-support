export function clientDisplayName(firstName?: string | null, lastName?: string | null) {
  const first = firstName?.trim().split(/\s+/).filter(Boolean) ?? [];
  const last = lastName?.trim() || (first.length > 1 ? first.at(-1) : "");
  const initial = last ? Array.from(last)[0]?.toLocaleUpperCase("fr-FR") : "";
  return [first[0], initial ? initial + "." : ""].filter(Boolean).join(" ");
}
