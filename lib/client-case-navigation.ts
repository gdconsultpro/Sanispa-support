const dossierPrefix = "/espace-client/interventions/";
const caseReturn = /^\/espace-client\/interventions\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(?:\/resume-pdf|#(?:validation|rendez-vous|rapport|factures))?$/i;

export function clientDossierPath(id: string) {
  return dossierPrefix + encodeURIComponent(id);
}

export function clientSummaryPdfPath(id: string) {
  return clientDossierPath(id) + "/resume-pdf";
}

/** Only a dossier, its summary or a known section can be a post-login destination. */
export function clientCaseReturnPath(value?: string | null) {
  return value && caseReturn.test(value) ? value : null;
}

export function clientCaseLoginPath(destination: string) {
  const path = clientCaseReturnPath(destination);
  return path ? `/connexion?next=compte&retour=${encodeURIComponent(path)}` : "/connexion?next=compte";
}
