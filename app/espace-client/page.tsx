"use client";
import { externalReportType } from "@/lib/client-external-report";
import {
  statusLabel,
  problemLabel,
  installationLabel,
} from "@/lib/display-labels";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button, ButtonLink } from "@/components/Button";
import { LagoonHero } from "@/components/LagoonHero";
import { Field, SelectField } from "@/components/Field";
import { StepHeader } from "@/components/StepHeader";
import { clearDraft, authHeaders, readLocalProgress } from "@/lib/storage";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { downloadBlob } from "@/lib/download";
import { CarePreviewCards, ClientCaseCard, DraftCard, type CarePreview } from "@/components/ClientSpaceCards";
import { clientCaseProgress, type ClientCase } from "@/lib/client-case-progress";
import { clientProfileUpdated } from "@/lib/client-display-name";
import type { DraftListItem } from "@/lib/client-drafts";
type Profile = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  address: string;
  postal_code: string;
  city: string;
  spa_brand: string;
  spa_model: string;
  spa_year: string;
};
type Spa = {
  id: string;
  brand: string;
  model: string | null;
  spa_year: string | null;
  installation_type: string | null;
};
type ClientDocument = {
  id: string;
  kind: "summary" | "uploaded";
  name: string;
  date: string;
  type: string;
  problemType: string;
  status: string;
  spa: string;
  diagnosticId?: string;
  issuedBy?: "client" | "sanispa" | "partner";
};
const emptyProfile: Profile = {
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  address: "",
  postal_code: "",
  city: "",
  spa_brand: "",
  spa_model: "",
  spa_year: "",
};
const documentTypes = [
  externalReportType,
  "Photo du spa",
  "Photo de la panne",
  "Facture d'achat",
  "Notice technique",
  "Devis",
  "Autre document",
];
const profileFields = [
  { key: "first_name", label: "Prénom", autoComplete: "given-name" },
  { key: "last_name", label: "Nom", autoComplete: "family-name" },
  { key: "phone", label: "Téléphone", autoComplete: "tel", type: "tel" },
  { key: "address", label: "Adresse", autoComplete: "street-address" },
  { key: "postal_code", label: "Code postal", autoComplete: "postal-code" },
  { key: "city", label: "Ville", autoComplete: "address-level2" },
] as const;
const views = [
  ["accueil", "Accueil"], ["spas", "Mon spa"], ["demandes", "Mes demandes"],
  ["entretien", "Mon entretien"], ["documents", "Mes documents"],
] as const;
type View = (typeof views)[number][0] | "coordonnees";

function currentView(): View {
  const requested = new URLSearchParams(window.location.search).get("view");
  if (requested === "spas" || requested === "coordonnees" || requested === "demandes" || requested === "entretien" || requested === "documents") return requested;
  return "accueil";
}

export default function EspaceClientPage() {
  const [drafts, setDrafts] = useState<DraftListItem[]>([]);
  const [draftsLoaded, setDraftsLoaded] = useState(false);
  const [local, setLocal] = useState<ReturnType<typeof readLocalProgress>>(null);
  const [sessionEmail, setSessionEmail] = useState("");
  const [care, setCare] = useState<CarePreview | null>(null);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState<View>("accueil");
  const [token, setToken] = useState("");
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileStatus, setProfileStatus] = useState<{ message: string; error?: boolean } | null>(null);
  const [diagnostics, setDiagnostics] = useState<ClientCase[]>([]);
  const [spas, setSpas] = useState<Spa[]>([]);
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [spaForm, setSpaForm] = useState({
    brand: "",
    model: "",
    spa_year: "",
    installation_type: "",
  });
  const [documentForm, setDocumentForm] = useState({
    documentType: "Photo du spa",
    spaId: "",
    diagnosticId: "",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const loadAll = useCallback(async (accessToken?: string, signal?: AbortSignal) => {
    const headers = accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : await authHeaders();
    const paths = ["/profile", "/dashboard?followUp=1", "/spas", "/documents", "/drafts", "/care?overview=1"];
    const [profile, cases, spas, documents, drafts, care] = await Promise.allSettled(
      paths.map(async (path) => {
        const response = await fetch("/api/client" + path, { headers, signal, cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        return response.json();
      }),
    );
    if (signal?.aborted) return;
    if (profile.status === "fulfilled" && profile.value.profile) {
      setProfile(profile.value.profile);
      setProfileLoaded(true);
    }
    if (cases.status === "fulfilled") setDiagnostics(cases.value.diagnostics ?? []);
    if (spas.status === "fulfilled") setSpas(spas.value.spas ?? []);
    if (documents.status === "fulfilled") setDocuments(documents.value.documents ?? []);
    if (drafts.status === "fulfilled") {
      setDrafts(drafts.value.drafts ?? []);
      setDraftsLoaded(true);
    }
    if (care.status === "fulfilled") setCare(care.value);
    const problems = [profile, cases, spas, documents, drafts].filter(result => result.status === "rejected");
    setLoadError(problems.some(result => result.reason?.message === "401")
      ? "Votre session a expiré. Reconnectez-vous pour retrouver votre espace."
      : problems.length ? "Certaines informations n’ont pas pu être chargées. Réessayez." : "");
  }, []);
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    const controller = new AbortController();
    setView(currentView());
    const restoreView = () => setView(currentView());
    window.addEventListener("popstate", restoreView);
    let initialized = false;
    let currentUser: string | null = null;
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (initialized && (session?.user.id ?? null) !== currentUser) {
          // Erase all in-memory dossier data when another tab switches account.
          window.location.reload();
          return;
        }
        setToken(session?.access_token ?? "");
        setSessionEmail(session?.user.email?.toLowerCase() || "");
      },
    );
    async function load() {
      try {
        const { data } = await supabase.auth.getSession();
        if (controller.signal.aborted) return;
        setLocal(readLocalProgress());
        currentUser = data.session?.user.id ?? null;
        initialized = true;
        if (data.session) await loadAll(data.session.access_token, controller.signal);
      } catch {
        if (!controller.signal.aborted) setLoadError("Impossible de charger votre espace. Réessayez.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => {
      controller.abort();
      subscription.subscription.unsubscribe();
      window.removeEventListener("popstate", restoreView);
    };
  }, [loadAll]);
  function selectView(next: View) {
    if (view === next) return;
    const url = new URL(window.location.href);
    if (next === "accueil") url.searchParams.delete("view");
    else url.searchParams.set("view", next);
    window.history.pushState(null, "", url);
    setView(next);
    window.scrollTo(0, 0);
  }
  function updateProfile(key: keyof Profile, value: string) {
    setProfile((current) => ({ ...current, [key]: value }));
    setProfileStatus(null);
  }
  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingProfile || !profileLoaded) return;
    setProfileStatus(null);
    setSavingProfile(true);
    try {
      const response = await fetch("/api/client/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(await authHeaders()),
        },
        body: JSON.stringify(profile),
      });
      const data = await response.json();
      if (!response.ok || !data.profile)
        throw new Error(data.error || "Enregistrement impossible.");
      setProfile(data.profile);
      setProfileStatus({ message: "Vos coordonnées ont été enregistrées." });
      window.dispatchEvent(new Event(clientProfileUpdated));
    } catch (saveError) {
      setProfileStatus({
        message: saveError instanceof Error ? saveError.message : "Enregistrement impossible pour le moment.",
        error: true,
      });
    } finally {
      setSavingProfile(false);
    }
  }
  async function addSpa(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/client/spas", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(spaForm),
    });
    const data = await response.json();
    if (data.spa) {
      setSpas((current) => [data.spa, ...current]);
      setSpaForm({ brand: "", model: "", spa_year: "", installation_type: "" });
    } else {
      setError(data.error || "Ajout du spa impossible.");
    }
  }
  async function uploadDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile) {
      setError(
        "Sélectionnez un fichier, puis cliquez sur « Ajouter le document ».",
      );
      return;
    }
    setError("");
    setMessage("");
    setUploadingDocument(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("documentType", documentForm.documentType);
      formData.append("spaId", documentForm.spaId);
      if (documentForm.documentType !== externalReportType) formData.append("diagnosticId", documentForm.diagnosticId);
      const response = await fetch("/api/client/documents/upload", {
        method: "POST",
        headers: { ...(await authHeaders()) },
        body: formData,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Téléversement impossible.");
      setSelectedFile(null);
      setMessage("Document ajouté.");
      await loadAll();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Téléversement impossible.",
      );
    } finally {
      setUploadingDocument(false);
    }
  }
  async function downloadDocument(document: ClientDocument) {
    setError("");
    try {
      const url =
        document.kind === "summary"
          ? `/api/client/documents/${document.id}/pdf`
          : `/api/client/documents/${document.id}`;
      const response = await fetch(url, {
        headers: { ...(await authHeaders()) },
      });
      if (!response.ok) {
        setError("Téléchargement impossible. Reconnectez-vous et réessayez.");
        return;
      }
      downloadBlob(
        await response.blob(),
        document.kind === "summary" ? `${document.name}.pdf` : document.name,
      );
    } catch {
      setError("Téléchargement impossible. Reconnectez-vous et réessayez.");
    }
  }
  async function deleteDocument(document: ClientDocument) {
    if (document.kind !== "uploaded" || document.issuedBy !== "client") return;
    const response = await fetch(`/api/client/documents/${document.id}`, {
      method: "DELETE",
      headers: { ...(await authHeaders()) },
    });
    if (response.ok) {
      setDocuments((current) =>
        current.filter((item) => item.id !== document.id),
      );
    }
  }
  async function logout() {
    const supabase = getSupabaseBrowser();
    await supabase.auth.signOut();
    clearDraft();
    window.location.href = "/";
  }
  const canResumeLocal = local?.pending &&
    (!sessionEmail || !local.draft.email || sessionEmail === local.draft.email.trim().toLowerCase()) &&
    (!token || !draftsLoaded || !local.draft.version || drafts.some(draft => draft.id === local.draft.draftId));
  const localDraft: DraftListItem | null = local && canResumeLocal ? {
    id: "local",
    step: local.step,
    updated_at: local.updatedAt,
    problemType: local.draft.problemType,
    spaId: local.draft.spaId,
    spaBrand: local.draft.spaBrand,
    spaModel: local.draft.spaModel,
    local: true,
  } : null;
  const availableDrafts = localDraft
    ? [localDraft, ...drafts.filter(draft => draft.id !== local?.draft.draftId || draft.version !== local?.draft.version)]
    : drafts;
  const dossierToHighlight = diagnostics.find(dossier => clientCaseProgress(dossier).needsAttention) ||
    diagnostics.find(dossier => clientCaseProgress(dossier).label !== "Dossier terminé") || diagnostics[0];
  const reportsToRead = diagnostics.filter(dossier => clientCaseProgress(dossier).needsAttention);
  const casesWithReports = diagnostics.filter(dossier => dossier.reports?.length);
  const latestDocument = documents.find(document => document.kind === "uploaded" && document.issuedBy !== "client");
  const externalReport = documentForm.documentType === externalReportType;
  const pendingInvoice = reportsToRead.find(dossier => !dossier.invoices?.length);
  if (loading) {
    return (
      <AppShell compact clientSpace>
        <div className="rounded-md border border-sanispa-line bg-white p-5 text-sanispa-steel">
          Chargement de votre espace client...
        </div>
      </AppShell>
    );
  }
  if (!token) {
    return (
      <AppShell compact clientSpace>
        <StepHeader
          eyebrow="Espace client"
          title="Mon espace spa"
          description="Retrouvez l’historique de votre spa, votre carnet, vos rappels, vos relevés, vos factures et vos rapports dans un seul espace. Services gratuits pour le moment."
        />
        {localDraft ? <div className="mb-5 max-w-xl"><DraftCard draft={localDraft} spas={[]} /></div> : null}
        <div className="flex flex-wrap gap-3">
          <Link
            href={localDraft ? "/connexion?next=diagnostic" : "/connexion?next=compte"}
            className="rounded-md bg-sanispa-navy px-5 py-3 font-bold text-white focus-ring"
          >
            Se connecter
          </Link>
          <Link
            href={localDraft ? "/acces?next=diagnostic" : "/acces?next=compte"}
            className="rounded-md border border-sanispa-line bg-white px-5 py-3 font-bold text-sanispa-navy focus-ring"
          >
            Créer un compte
          </Link>
        </div>
      </AppShell>
    );
  }
  return (
    <AppShell compact clientSpace clientHome={view === "accueil"}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-3">
        <h1 className="text-2xl font-bold text-sanispa-navy sm:text-3xl">Mon espace spa</h1>
        <div className="flex flex-wrap items-center gap-x-3">
          {view === "coordonnees" ? null : (
            <button type="button" onClick={() => selectView("coordonnees")}
              className="focus-ring min-h-11 rounded-md px-2 text-sm font-bold text-sanispa-blue underline">
              Modifier mes coordonnées
            </button>
          )}
          <button type="button" onClick={logout}
            className="focus-ring min-h-11 rounded-md px-2 text-sm font-bold text-sanispa-steel underline">
            Déconnexion
          </button>
        </div>
      </div>

      {view === "accueil" ? (
        <div className="mb-4">
          <LagoonHero firstName={profile.first_name} signedIn>
            <ButtonLink href={availableDrafts.length ? "/diagnostic?new=1" : "/diagnostic"}>
              {availableDrafts.length ? "Nouvelle demande" : "Déclarer une panne"}
            </ButtonLink>
          </LagoonHero>
        </div>
      ) : null}
      {view === "accueil" && availableDrafts[0] ? (
        <section className="mb-5" aria-label="Votre déclaration en cours">
          <h2 className="mb-2 text-xl font-bold">Reprendre ma déclaration</h2>
          <DraftCard draft={availableDrafts[0]} spas={spas} />
          {availableDrafts.length > 1 ? <button type="button" onClick={() => selectView("demandes")} className="focus-ring mt-2 min-h-11 font-bold underline">Voir tous mes brouillons</button> : null}
        </section>
      ) : null}
      <nav aria-label="Rubriques de mon espace spa" className="mb-5 flex gap-1.5 overflow-x-auto whitespace-nowrap rounded-xl border border-sanispa-line bg-white p-1.5 sm:flex-wrap">
        {views.map(([key, label]) => (
          <button type="button" key={key} onClick={() => selectView(key)} aria-current={view === key ? "page" : undefined}
            className={`focus-ring min-h-11 shrink-0 rounded-lg px-3 py-2 text-sm font-bold sm:px-4 ${view === key ? "bg-sanispa-ice text-sanispa-blue" : "text-sanispa-steel hover:bg-sanispa-ice"}`}>
            {label}
          </button>
        ))}
      </nav>
      {loadError ? (
        <p className="mb-4 rounded-xl bg-amber-50 p-4 text-sm" role="alert">
          {loadError}{" "}
          {loadError.startsWith("Votre session") ? <Link href="/connexion?next=compte" className="font-bold underline">Me connecter</Link>
            : <button type="button" className="font-bold underline" onClick={() => void loadAll(token)}>Réessayer</button>}
        </p>
      ) : null}
      <div className="grid min-w-0 gap-5">
        {error ? <p className="rounded-md bg-red-50 p-3 text-red-700" role="alert">{error}</p> : null}
        {view === "accueil" ? (
          <>
            {dossierToHighlight ? (
              <section aria-label="Votre demande à suivre">
                <h2 className="mb-2 text-xl font-bold">{reportsToRead.length ? "Action à faire" : "Ma demande à suivre"}</h2>
                <ClientCaseCard dossier={dossierToHighlight} compact />
              </section>
            ) : null}
            <section aria-label="L’entretien de votre spa">
              <h2 className="mb-2 text-xl font-bold">Mon entretien</h2>
              <CarePreviewCards care={care} spas={spas} compact />
            </section>
            <section className="min-w-0 rounded-2xl border border-sanispa-line bg-white p-4 sm:p-5">
              <h2 className="text-xl font-bold">Mes documents</h2>
              <p className="mt-2 break-words text-sm">
                {pendingInvoice ? `Facture d’intervention attendue pour le dossier n°${pendingInvoice.public_reference || "en cours"}.`
                  : latestDocument ? `Dernier document reçu · ${latestDocument.name}` : "Retrouvez les résumés, rapports et factures disponibles."}
              </p>
              <button type="button" className="focus-ring mt-2 min-h-11 font-bold underline" onClick={() => selectView("documents")}>Ouvrir mes documents</button>
            </section>
          </>
        ) : null}

        {view === "demandes" ? (
          <>
            {availableDrafts.length ? (
              <section>
                <h2 className="mb-2 text-xl font-bold">Mes brouillons</h2>
                <p className="mb-3 text-sm text-sanispa-steel">Les brouillons n’ont pas encore été envoyés à SANISPA.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {availableDrafts.map(draft => <DraftCard key={draft.id} draft={draft} spas={spas} />)}
                </div>
              </section>
            ) : null}
            <section>
              <h2 className="mb-3 text-xl font-bold">Mes demandes envoyées</h2>
              {diagnostics.length ? <div className="grid gap-3 md:grid-cols-2">
                {diagnostics.map(dossier => <ClientCaseCard key={dossier.id} dossier={dossier} />)}
              </div> : <p className="text-sm text-sanispa-steel">{loadError ? "Le suivi pourra être affiché après actualisation." : "Aucune demande envoyée pour le moment."}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <ButtonLink href="/diagnostic?new=1" variant="secondary">Nouvelle demande</ButtonLink>
                <Link href="/visio" className="focus-ring inline-flex min-h-12 items-center font-bold underline">Mes rendez-vous en visio</Link>
              </div>
            </section>
          </>
        ) : null}

        {view === "entretien" ? (
          <section>
            <h2 className="mb-3 text-xl font-bold">Mon entretien</h2>
            <CarePreviewCards care={care} spas={spas} />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ["Mon assistant spa", "Pour l’eau, l’entretien ou une panne.", "/premium/assistant"],
                ["Notices en français", "Retrouvez votre clavier à l’aide des photos.", "/premium/notices"],
                ["Forum des particuliers", "Échangez avec d’autres propriétaires.", "/premium/forum"],
              ].map(([title, description, href]) => (
                <Link href={href} key={href} className="focus-ring rounded-2xl border border-sanispa-line bg-white p-4">
                  <h3 className="font-bold">{title} →</h3><p className="mt-1 text-sm">{description}</p>
                </Link>
              ))}
              <button type="button" onClick={() => selectView("spas")} className="focus-ring rounded-2xl border border-sanispa-line bg-white p-4 text-left">
                <span className="font-bold">Mes spas →</span>
              </button>
            </div>
          </section>
        ) : null}

        {view === "documents" && casesWithReports.length ? (
          <section>
            <h2 className="mb-2 text-xl font-bold">Rapports d’intervention</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {casesWithReports.map(dossier => (
                <article key={dossier.id} className="min-w-0 rounded-xl border border-sanispa-line bg-white p-4">
                  <h3 className="break-words font-bold">{problemLabel(dossier.problem_type)}</h3>
                  <p className="mt-1 text-sm">Dossier n°{dossier.public_reference || "Référence en cours"}</p>
                  <div className="mt-3">
                    <ButtonLink href={`/espace-client/interventions/${dossier.id}#rapport`} variant="secondary">
                      Lire le compte rendu
                    </ButtonLink>
                  </div>
                </article>
              ))}
            </div>
            {pendingInvoice ? <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm">La facture du dossier n°{pendingInvoice.public_reference || "en cours"} doit encore être déposée avant de clôturer une réparation.</p> : null}
          </section>
        ) : null}

        <section hidden={view !== "spas"} className="rounded-md border border-sanispa-line bg-white p-5 shadow-soft">
          <h2 className="text-xl font-bold text-sanispa-navy">Mes spas</h2>
          <form onSubmit={addSpa} className="mt-4 grid gap-4 sm:grid-cols-4">
            <Field
              label="Marque"
              name="brand"
              value={spaForm.brand}
              onChange={(value) =>
                setSpaForm((current) => ({ ...current, brand: value }))
              }
            />
            <Field
              label="Modèle"
              name="model"
              value={spaForm.model}
              onChange={(value) =>
                setSpaForm((current) => ({ ...current, model: value }))
              }
            />
            <Field
              label="Année"
              name="spa_year"
              value={spaForm.spa_year}
              onChange={(value) =>
                setSpaForm((current) => ({ ...current, spa_year: value }))
              }
            />
            <SelectField
              label="Installation"
              name="installation_type"
              value={spaForm.installation_type}
              onChange={(value) =>
                setSpaForm((current) => ({
                  ...current,
                  installation_type: value,
                }))
              }
              options={[
                { value: "interieur", label: "Intérieur" },
                { value: "exterieur", label: "Extérieur" },
              ]}
            />
            <div className="sm:col-span-4">
              <Button type="submit">Ajouter ce spa</Button>
            </div>
          </form>

          <div className="mt-4 grid gap-3">
            {spas.map((spa) => (
              <div
                key={spa.id}
                className="rounded-md bg-sanispa-ice p-4 text-sm text-sanispa-steel"
              >
                <strong className="text-sanispa-navy">{spa.brand}</strong>{" "}
                {spa.model ?? ""} {spa.spa_year ? `· ${spa.spa_year}` : ""}{" "}
                {spa.installation_type
                  ? `· ${installationLabel(spa.installation_type)}`
                  : ""}
              </div>
            ))}
          </div>
        </section>

        <section hidden={view !== "documents"} className="rounded-md border border-sanispa-line bg-white p-5 shadow-soft">
          <h2 className="text-xl font-bold text-sanispa-navy">
            Mes factures et documents
          </h2>
          {message ? <p role="status" className="mt-3 rounded-md bg-green-50 p-3 text-sm font-bold text-green-700">{message}</p> : null}

          <details className="my-4 rounded-xl border border-sanispa-line bg-sanispa-ice p-4">
            <summary className="focus-ring cursor-pointer font-bold">Ajouter un document ou un rapport externe</summary>
          <form
            onSubmit={uploadDocument}
            className="mt-4 grid gap-4 rounded-md border border-dashed border-sanispa-line bg-sanispa-ice p-4"
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <SelectField
                label="Type de document"
                name="documentType"
                value={documentForm.documentType}
                onChange={(value) =>
                  setDocumentForm((current) => ({
                    ...current,
                    documentType: value,
                  }))
                }
                options={documentTypes.map((type) => ({
                  value: type,
                  label: type,
                }))}
              />
              <SelectField
                label="Spa concerné (facultatif)"
                name="spaId"
                value={documentForm.spaId}
                onChange={(value) =>
                  setDocumentForm((current) => ({ ...current, spaId: value }))
                }
                options={spas.map((spa) => ({
                  value: spa.id,
                  label: [spa.brand, spa.model].filter(Boolean).join(" - "),
                }))}
              />
              {!externalReport ? <SelectField
                label="Dossier SAV lié (facultatif)"
                name="diagnosticId"
                value={documentForm.diagnosticId}
                onChange={(value) =>
                  setDocumentForm((current) => ({
                    ...current,
                    diagnosticId: value,
                  }))
                }
                options={diagnostics.map((diagnostic) => ({
                  value: diagnostic.id,
                  label: `Dossier ${diagnostic.public_reference || "Référence en cours"} - ${problemLabel(diagnostic.problem_type)}`,
                }))}
              /> : null}
            </div>

            {externalReport ? <p className="text-sm text-sanispa-steel">Ajoutez ici le PDF reçu après une intervention organisée directement avec un professionnel. Le rapport est enregistré dans votre espace personnel.</p> : null}
            <label
              onDrop={(event) => {
                event.preventDefault();
                setSelectedFile(event.dataTransfer.files?.[0] ?? null);
              }}
              onDragOver={(event) => event.preventDefault()}
              className="block cursor-pointer rounded-md border border-dashed border-sanispa-line bg-white p-5 text-center text-sm font-semibold text-sanispa-steel"
            >
              {selectedFile
                ? selectedFile.name
                : externalReport ? "Sélectionnez le rapport (PDF, 3 Mo maximum)."
                  : "Déposez un fichier ici ou cliquez pour le sélectionner (PDF, JPG, PNG, HEIC, HEIF ou Word, 3 Mo maximum)."}
              <input
                className="hidden"
                type="file"
                accept={externalReport ? ".pdf,application/pdf" : ".pdf,.jpg,.jpeg,.png,.heic,.heif,.doc,.docx,application/pdf,image/jpeg,image/png,image/heic,image/heif,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
                onChange={(event) =>
                  setSelectedFile(event.target.files?.[0] ?? null)
                }
              />
            </label>

            <p className="text-sm text-sanispa-steel">
              Le fichier sélectionné sera ajouté à votre espace client après
              validation avec le bouton ci-dessous.
            </p>
            <Button type="submit" disabled={uploadingDocument}>
              {uploadingDocument ? "Ajout du document…" : "Ajouter le document"}
            </Button>
          </form>
          </details>

          <div className="mt-4 grid gap-3">
            {documents.length ? (
              documents.map((document) => (
                <div
                  key={`${document.kind}-${document.id}`}
                  className="rounded-md bg-sanispa-ice p-4"
                >
                  <p className="font-bold text-sanispa-navy">{document.name}</p>
                  <p className="mt-1 text-sm text-sanispa-steel">
                    {new Date(document.date).toLocaleString("fr-FR")} ·{" "}
                    {document.type} · {statusLabel(document.status)}
                  </p>
                  <p className="text-sm text-sanispa-steel">
                    Spa : {document.spa}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => downloadDocument(document)}
                      className="rounded-md border border-sanispa-line bg-white px-3 py-2 text-sm font-bold text-sanispa-navy focus-ring"
                    >
                      Télécharger le document
                    </button>
                    {document.kind === "uploaded" &&
                    document.issuedBy === "client" ? (
                      <button
                        onClick={() => deleteDocument(document)}
                        className="rounded-md border border-red-100 bg-white px-3 py-2 text-sm font-bold text-red-700 focus-ring"
                      >
                        Supprimer le document
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sanispa-steel">
                Aucun document disponible pour le moment.
              </p>
            )}
          </div>
        </section>

        <section hidden={view !== "documents"} className="rounded-md border border-sanispa-line bg-white p-5 shadow-soft">
          <h2 className="text-xl font-bold text-sanispa-navy">
            Factures et documents d’intervention
          </h2>
          <p className="mt-2 text-sanispa-steel">
            Les services de l’application sont actuellement gratuits. Les factures, devis et rapports transmis par SANISPA ou votre technicien restent accessibles dans « Mes factures et documents ».
          </p>
        </section>

        {view === "coordonnees" ? (
          <section aria-labelledby="contact-title" className="min-w-0 rounded-2xl border border-sanispa-line bg-white p-4 sm:p-6">
            <h2 id="contact-title" className="text-xl font-bold text-sanispa-navy">Mes coordonnées</h2>
            <p className="mb-5 mt-2 text-sm text-sanispa-steel">Vos coordonnées seront reprises dans vos nouvelles déclarations.</p>
            {profileLoaded ? (
              <form onSubmit={saveProfile}>
                <fieldset disabled={savingProfile} className="grid min-w-0 gap-4 sm:grid-cols-2">
                  {profileFields.map((field) => (
                    <Field
                      key={field.key}
                      label={field.label}
                      name={field.key}
                      autoComplete={field.autoComplete}
                      type={"type" in field ? field.type : undefined}
                      value={profile[field.key] ?? ""}
                      onChange={(value) => updateProfile(field.key, value)}
                    />
                  ))}
                  <div className="min-w-0 sm:col-span-2">
                    <p className="text-sm font-bold text-sanispa-navy">Adresse e-mail de connexion</p>
                    <p className="break-all text-sm text-sanispa-steel">{sessionEmail}</p>
                  </div>
                  <details className="rounded-xl border border-sanispa-line p-3 sm:col-span-2">
                    <summary className="focus-ring cursor-pointer text-sm font-bold">Informations complémentaires sur le spa</summary>
                    <div className="mt-3 grid gap-4 sm:grid-cols-3">
                      <Field label="Marque du spa" name="spa_brand" value={profile.spa_brand ?? ""} onChange={(value) => updateProfile("spa_brand", value)} />
                      <Field label="Modèle du spa" name="spa_model" value={profile.spa_model ?? ""} onChange={(value) => updateProfile("spa_model", value)} />
                      <Field label="Année approximative" name="spa_year" value={profile.spa_year ?? ""} onChange={(value) => updateProfile("spa_year", value)} />
                    </div>
                  </details>
                  <div className="sm:col-span-2">
                    {profileStatus ? (
                      <p role={profileStatus.error ? "alert" : "status"}
                        className={`mb-3 rounded-md p-3 text-sm font-bold ${profileStatus.error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                        {profileStatus.message}
                      </p>
                    ) : null}
                    <Button type="submit" disabled={savingProfile}>
                      {savingProfile ? "Enregistrement…" : "Enregistrer mes coordonnées"}
                    </Button>
                  </div>
                </fieldset>
              </form>
            ) : <p className="text-sm text-sanispa-steel">Vos coordonnées sont momentanément indisponibles.</p>}
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
