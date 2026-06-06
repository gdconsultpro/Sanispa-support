"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { Field, SelectField } from "@/components/Field";
import { StepHeader } from "@/components/StepHeader";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

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

type Diagnostic = {
  id: string;
  created_at: string;
  status: string;
  problem_type: string;
  choice: string | null;
  payment_status: string | null;
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
  spa_year: ""
};

const documentTypes = [
  "Photo du spa",
  "Photo de la panne",
  "Facture d'achat",
  "Notice technique",
  "Devis",
  "Autre document"
];

export default function EspaceClientPage() {
  const [token, setToken] = useState("");
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [spas, setSpas] = useState<Spa[]>([]);
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [spaForm, setSpaForm] = useState({ brand: "", model: "", spa_year: "", installation_type: "" });
  const [documentForm, setDocumentForm] = useState({ documentType: "Photo du spa", spaId: "", diagnosticId: "" });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const supabase = getSupabaseBrowser();
        const { data } = await supabase.auth.getSession();
        const accessToken = data.session?.access_token;
        if (!accessToken) {
          setLoading(false);
          return;
        }

        setToken(accessToken);
        await loadAll(accessToken);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  async function loadAll(accessToken = token) {
    const headers = { Authorization: `Bearer ${accessToken}` };

    const [profileResponse, dashboardResponse, spasResponse, documentsResponse] = await Promise.all([
      fetch("/api/client/profile", { headers }),
      fetch("/api/client/dashboard", { headers }),
      fetch("/api/client/spas", { headers }),
      fetch("/api/client/documents", { headers })
    ]);

    const profileData = await profileResponse.json();
    const dashboardData = await dashboardResponse.json();
    const spasData = await spasResponse.json();
    const documentsData = await documentsResponse.json();

    if (profileData.profile) setProfile(profileData.profile);
    setDiagnostics(dashboardData.diagnostics ?? []);
    setSpas(spasData.spas ?? []);
    setDocuments(documentsData.documents ?? []);
  }

  function updateProfile(key: keyof Profile, value: string) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    setSavingProfile(true);

    try {
      const response = await fetch("/api/client/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(profile)
      });
      const data = await response.json();
      if (!response.ok || !data.profile) throw new Error(data.error || "Enregistrement impossible.");
      setProfile(data.profile);
      setMessage("Informations enregistrées.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Enregistrement impossible pour le moment.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function addSpa(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/client/spas", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(spaForm)
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
      setError("Sélectionnez un document à téléverser.");
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
      formData.append("diagnosticId", documentForm.diagnosticId);

      const response = await fetch("/api/client/documents/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Téléversement impossible.");

      setSelectedFile(null);
      setMessage("Document ajouté.");
      await loadAll();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Téléversement impossible.");
    } finally {
      setUploadingDocument(false);
    }
  }

  async function downloadDocument(document: ClientDocument) {
    const url = document.kind === "summary" ? `/api/client/documents/${document.id}/pdf` : `/api/client/documents/${document.id}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await response.blob();
    const href = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = href;
    link.download = document.kind === "summary" ? `${document.name}.pdf` : document.name;
    link.click();
    URL.revokeObjectURL(href);
  }

  async function deleteDocument(document: ClientDocument) {
    if (document.kind !== "uploaded") return;
    const response = await fetch(`/api/client/documents/${document.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.ok) {
      setDocuments((current) => current.filter((item) => item.id !== document.id));
    }
  }

  async function logout() {
    const supabase = getSupabaseBrowser();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (loading) {
    return (
      <AppShell compact>
        <div className="rounded-md border border-sanispa-line bg-white p-5 text-sanispa-steel">Chargement de votre espace client...</div>
      </AppShell>
    );
  }

  if (!token) {
    return (
      <AppShell compact>
        <StepHeader eyebrow="Espace client" title="Connectez-vous" description="Retrouvez vos demandes et préremplissez vos prochaines déclarations." />
        <div className="flex flex-wrap gap-3">
          <Link href="/connexion" className="rounded-md bg-sanispa-navy px-5 py-3 font-bold text-white focus-ring">Se connecter</Link>
          <Link href="/inscription" className="rounded-md border border-sanispa-line bg-white px-5 py-3 font-bold text-sanispa-navy focus-ring">Créer un compte</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell compact>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <StepHeader eyebrow="Espace client" title="Mon espace SANISPA" description="Lancez une demande, suivez vos dossiers et retrouvez vos documents." />
        <button onClick={logout} className="rounded-md border border-sanispa-line bg-white px-4 py-2 text-sm font-bold text-sanispa-steel focus-ring">Déconnexion</button>
      </div>

      <div className="grid gap-5">
        <section className="rounded-md border border-sanispa-line bg-white p-5 shadow-soft">
          <h2 className="text-xl font-bold text-sanispa-navy">Nouvelle demande d'assistance</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Traitement de l'eau", "traitement-eau"],
              ["Fuite", "fuite"],
              ["Panne électrique", "electrique"],
              ["Filtration", "filtration"],
              ["Pompe", "pompe"],
              ["Chauffage", "chauffage"],
              ["Autre problème", "autre"]
            ].map(([label, problemType]) => (
              <Link key={problemType} href={`/diagnostic?problemType=${problemType}`} className="rounded-md border border-sanispa-line bg-sanispa-ice px-4 py-3 text-sm font-bold text-sanispa-navy transition hover:border-sanispa-blue hover:bg-white focus-ring">
                {label}
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-sanispa-line bg-white p-5 shadow-soft">
          <h2 className="text-xl font-bold text-sanispa-navy">Mes demandes</h2>
          <div className="mt-4 grid gap-3">
            {diagnostics.length ? diagnostics.map((diagnostic) => (
              <div key={diagnostic.id} className="rounded-md bg-sanispa-ice p-4">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-sanispa-blue">Dossier n°{diagnostic.id.slice(0, 8).toUpperCase()}</p>
                <p className="mt-2 font-bold text-sanispa-navy">{diagnostic.problem_type} · {diagnostic.status}</p>
                <p className="text-sm text-sanispa-steel">{new Date(diagnostic.created_at).toLocaleString("fr-FR")} · Paiement : {diagnostic.payment_status ?? "non requis / non payé"}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => downloadDocument({ id: diagnostic.id, kind: "summary", name: `Résumé de demande n°${diagnostic.id.slice(0, 8).toUpperCase()}`, date: diagnostic.created_at, type: "Résumé", problemType: diagnostic.problem_type, status: diagnostic.status, spa: "" })} className="rounded-md border border-sanispa-line bg-white px-3 py-2 text-sm font-bold text-sanispa-navy focus-ring">
                    Télécharger le résumé
                  </button>
                  <Link href={`/diagnostic?problemType=${diagnostic.problem_type}`} className="rounded-md border border-sanispa-line bg-white px-3 py-2 text-sm font-bold text-sanispa-blue focus-ring">
                    Reprendre
                  </Link>
                </div>
              </div>
            )) : <p className="text-sanispa-steel">Aucune demande retrouvée avec cet email.</p>}
          </div>
        </section>

        <section className="rounded-md border border-sanispa-line bg-white p-5 shadow-soft">
          <h2 className="text-xl font-bold text-sanispa-navy">Mes spas</h2>
          <form onSubmit={addSpa} className="mt-4 grid gap-4 sm:grid-cols-4">
            <Field label="Marque" name="brand" value={spaForm.brand} onChange={(value) => setSpaForm((current) => ({ ...current, brand: value }))} />
            <Field label="Modèle" name="model" value={spaForm.model} onChange={(value) => setSpaForm((current) => ({ ...current, model: value }))} />
            <Field label="Année" name="spa_year" value={spaForm.spa_year} onChange={(value) => setSpaForm((current) => ({ ...current, spa_year: value }))} />
            <SelectField label="Installation" name="installation_type" value={spaForm.installation_type} onChange={(value) => setSpaForm((current) => ({ ...current, installation_type: value }))} options={[{ value: "interieur", label: "Intérieur" }, { value: "exterieur", label: "Extérieur" }]} />
            <div className="sm:col-span-4">
              <Button type="submit">Ajouter ce spa</Button>
            </div>
          </form>

          <div className="mt-4 grid gap-3">
            {spas.map((spa) => (
              <div key={spa.id} className="rounded-md bg-sanispa-ice p-4 text-sm text-sanispa-steel">
                <strong className="text-sanispa-navy">{spa.brand}</strong> {spa.model ?? ""} {spa.spa_year ? `· ${spa.spa_year}` : ""} {spa.installation_type ? `· ${spa.installation_type}` : ""}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-sanispa-line bg-white p-5 shadow-soft">
          <h2 className="text-xl font-bold text-sanispa-navy">Mes documents</h2>

          <form onSubmit={uploadDocument} className="mt-4 grid gap-4 rounded-md border border-dashed border-sanispa-line bg-sanispa-ice p-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <SelectField label="Type de document" name="documentType" value={documentForm.documentType} onChange={(value) => setDocumentForm((current) => ({ ...current, documentType: value }))} options={documentTypes.map((type) => ({ value: type, label: type }))} />
              <SelectField label="Spa concerné" name="spaId" value={documentForm.spaId} onChange={(value) => setDocumentForm((current) => ({ ...current, spaId: value }))} options={spas.map((spa) => ({ value: spa.id, label: [spa.brand, spa.model].filter(Boolean).join(" - ") }))} />
              <SelectField label="Dossier SAV lié" name="diagnosticId" value={documentForm.diagnosticId} onChange={(value) => setDocumentForm((current) => ({ ...current, diagnosticId: value }))} options={diagnostics.map((diagnostic) => ({ value: diagnostic.id, label: `Dossier ${diagnostic.id.slice(0, 8).toUpperCase()} - ${diagnostic.problem_type}` }))} />
            </div>

            <label onDrop={(event) => { event.preventDefault(); setSelectedFile(event.dataTransfer.files?.[0] ?? null); }} onDragOver={(event) => event.preventDefault()} className="block cursor-pointer rounded-md border border-dashed border-sanispa-line bg-white p-5 text-center text-sm font-semibold text-sanispa-steel">
              {selectedFile ? selectedFile.name : "Déposer un fichier ici ou cliquer pour sélectionner un document"}
              <input className="hidden" type="file" accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.doc,.docx,application/pdf,image/jpeg,image/png,image/heic,image/heif,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} />
            </label>

            <Button type="submit" disabled={uploadingDocument}>{uploadingDocument ? "Téléversement..." : "Téléverser un document"}</Button>
          </form>

          <div className="mt-4 grid gap-3">
            {documents.length ? documents.map((document) => (
              <div key={`${document.kind}-${document.id}`} className="rounded-md bg-sanispa-ice p-4">
                <p className="font-bold text-sanispa-navy">{document.name}</p>
                <p className="mt-1 text-sm text-sanispa-steel">{new Date(document.date).toLocaleString("fr-FR")} · {document.type} · {document.status}</p>
                <p className="text-sm text-sanispa-steel">Spa : {document.spa}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => downloadDocument(document)} className="rounded-md border border-sanispa-line bg-white px-3 py-2 text-sm font-bold text-sanispa-navy focus-ring">
                    Télécharger
                  </button>
                  {document.kind === "uploaded" ? (
                    <button onClick={() => deleteDocument(document)} className="rounded-md border border-red-100 bg-white px-3 py-2 text-sm font-bold text-red-700 focus-ring">
                      Supprimer
                    </button>
                  ) : null}
                </div>
              </div>
            )) : <p className="text-sanispa-steel">Aucun document disponible pour le moment.</p>}
          </div>
        </section>

        <section className="rounded-md border border-sanispa-line bg-white p-5 shadow-soft">
          <h2 className="text-xl font-bold text-sanispa-navy">Mes factures</h2>
          <p className="mt-2 text-sanispa-steel">Les factures liées aux paiements seront ajoutées ici après raccordement complet avec Stripe Billing.</p>
        </section>

        <section className="rounded-md border border-sanispa-line bg-white shadow-soft">
          <button type="button" onClick={() => setInfoOpen((open) => !open)} className="flex w-full items-center justify-between px-5 py-4 text-left focus-ring">
            <span>
              <span className="block text-xl font-bold text-sanispa-navy">Mes informations</span>
              <span className="mt-1 block text-sm text-sanispa-steel">Modifier mes coordonnées et les informations de mon spa.</span>
            </span>
            <span className="text-2xl font-bold text-sanispa-blue">{infoOpen ? "−" : "+"}</span>
          </button>

          {infoOpen ? (
            <form onSubmit={saveProfile} className="grid gap-4 border-t border-sanispa-line p-5 sm:grid-cols-2">
              <Field label="Prénom" name="first_name" value={profile.first_name ?? ""} onChange={(value) => updateProfile("first_name", value)} />
              <Field label="Nom" name="last_name" value={profile.last_name ?? ""} onChange={(value) => updateProfile("last_name", value)} />
              <Field label="Téléphone" name="phone" value={profile.phone ?? ""} onChange={(value) => updateProfile("phone", value)} />
              <Field label="Email" name="email" value={profile.email ?? ""} onChange={(value) => updateProfile("email", value)} />
              <Field label="Adresse" name="address" value={profile.address ?? ""} onChange={(value) => updateProfile("address", value)} />
              <Field label="Code postal" name="postal_code" value={profile.postal_code ?? ""} onChange={(value) => updateProfile("postal_code", value)} />
              <Field label="Ville" name="city" value={profile.city ?? ""} onChange={(value) => updateProfile("city", value)} />
              <Field label="Marque du spa" name="spa_brand" value={profile.spa_brand ?? ""} onChange={(value) => updateProfile("spa_brand", value)} />
              <Field label="Modèle du spa" name="spa_model" value={profile.spa_model ?? ""} onChange={(value) => updateProfile("spa_model", value)} />
              <Field label="Année approximative" name="spa_year" value={profile.spa_year ?? ""} onChange={(value) => updateProfile("spa_year", value)} />
              <div className="sm:col-span-2">
                {message ? <p className="mb-3 rounded-md bg-green-50 p-3 text-sm font-bold text-green-700">{message}</p> : null}
                {error ? <p className="mb-3 rounded-md bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
                <Button type="submit" disabled={savingProfile}>{savingProfile ? "Enregistrement..." : "Enregistrer mes informations"}</Button>
              </div>
            </form>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}
