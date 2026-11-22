export function adminDossierId(input?: string | null) {
  return input && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input) ? input.toLowerCase() : null;
}

export type AdminDossierSection = "diagnostic" | "followup" | "documents" | "history";

export function adminDossierSection(input?: string | null): AdminDossierSection {
  return input === "followup" || input === "documents" || input === "history" ? input : "diagnostic";
}

export const adminPartnersPath = "/admin?tab=partners";
export const adminClientsPath = "/admin?tab=clients";

export function adminDirectoryTab(input?: string | null) {
  return input === "partners" || input === "clients" ? input : null;
}

function adminDestination(path: string, input?: string | null, section?: string | null, tab?: string | null) {
  const directory = adminDirectoryTab(tab);
  if (directory) return path + "?tab=" + directory;
  const id = adminDossierId(input);
  if (!id) return path;
  const params = new URLSearchParams({ dossier: id });
  if (adminDossierSection(section) !== "diagnostic") params.set("section", adminDossierSection(section));
  return path + "?" + params.toString();
}

export function adminDossierPath(id?: string | null, section?: string | null, tab?: string | null) {
  return adminDestination("/admin", id, section, tab);
}

export function adminLoginPath(id?: string | null, section?: string | null, tab?: string | null) {
  return adminDestination("/admin/connexion", id, section, tab);
}
