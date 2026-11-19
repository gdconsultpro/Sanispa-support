export function dossierReference(row: { public_reference?: string | null } | { public_reference?: string | null }[] | null | undefined) {
  return (Array.isArray(row) ? row[0] : row)?.public_reference || "Référence en cours";
}
