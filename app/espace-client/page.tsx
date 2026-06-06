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

type ClientDocument = {
  id: string;
  name: string;
  date: string;
  problemType: string;
  status: string;
  spa: string;
};

type Spa = {
  id: string;
  brand: string;
  model: string | null;
  spa_year: string | null;
  installation_type: string | null;
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

export default function EspaceClientPage() {
  const [token, setToken] = useState("");
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [spas, setSpas] = useState<Spa[]>([]);
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [spaForm, setSpaForm] = useState({ brand: "", model: "", spa_year: "", installation_type: "" });
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
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
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

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

      if (!response.ok || !data.profile) {
        throw new Error(data.error || "Enregistrement impossible.");
      }

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
    const response = await fetch("/api/client/spas", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(spaForm)
    });
    const data = await response.json();
    if (data.spa) {
      setSpas((current) => [data.spa, ...current]);
      setSpaForm({ brand: "", model: "", spa_year: "", installation_type: "" });
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
        <StepHeader eyebrow="Espace client" title="Mon espace SANISPA" description="Vos coordonnées, vos spas et l'historique de vos demandes." />
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
              <Link
                key={problemType}
                href={`/diagnostic?problemType=${problemType}`}
                className="rounded-md border border-sanispa-line bg-sanispa-ice px-4 py-3 text-sm font-bold text-sanispa-navy transition hover:border-sanispa-blue hover:bg-white focus-ring"
              >
                {label}
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-sanispa-line bg-white p-5 shadow-soft">
          <h2 className="text-xl font-bold text-sanispa-navy">Mes informations</h2>
          <form onSubmit={saveProfile} className="mt-4 grid gap-4 sm:grid-cols-2">
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
              <Button type="submit" disabled={savingProfile}>
                {savingProfile ? "Enregistrement..." : "Enregistrer mes informations"}
              </Button>
            </div>
          </form>
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
                  <a href={`/api/client/documents/${diagnostic.id}/pdf`} className="rounded-md border border-sanispa-line bg-white px-3 py-2 text-sm font-bold text-sanispa-navy focus-ring">
                    Télécharger le résumé
                  </a>
                  <Link href={`/resume`} className="rounded-md border border-sanispa-line bg-white px-3 py-2 text-sm font-bold text-sanispa-steel focus-ring">
                    Voir le dossier
                  </Link>
                  {diagnostic.status !== "terminé" ? (
                    <Link href={`/diagnostic?problemType=${diagnostic.problem_type}`} className="rounded-md border border-sanispa-line bg-white px-3 py-2 text-sm font-bold text-sanispa-blue focus-ring">
                      Reprendre
                    </Link>
                  ) : null}
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
            <SelectField
              label="Installation"
              name="installation_type"
              value={spaForm.installation_type}
              onChange={(value) => setSpaForm((current) => ({ ...current, installation_type: value }))}
              options={[
                { value: "interieur", label: "Intérieur" },
                { value: "exterieur", label: "Extérieur" }
              ]}
            />
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
          <div className="mt-4 grid gap-3">
            {documents.length ? documents.map((document) => (
              <div key={document.id} className="rounded-md bg-sanispa-ice p-4">
                <p className="font-bold text-sanispa-navy">{document.name}</p>
                <p className="mt-1 text-sm text-sanispa-steel">{new Date(document.date).toLocaleString("fr-FR")} · {document.problemType} · {document.status}</p>
                <p className="text-sm text-sanispa-steel">Spa : {document.spa}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={`/api/client/documents/${document.id}/pdf`} className="rounded-md border border-sanispa-line bg-white px-3 py-2 text-sm font-bold text-sanispa-navy focus-ring">
                    Télécharger PDF
                  </a>
                  <Link href={`/diagnostic?problemType=${document.problemType}`} className="rounded-md border border-sanispa-line bg-white px-3 py-2 text-sm font-bold text-sanispa-steel focus-ring">
                    Consulter
                  </Link>
                </div>
              </div>
            )) : <p className="text-sanispa-steel">Aucun document disponible pour le moment.</p>}
          </div>
        </section>

        <section className="rounded-md border border-sanispa-line bg-white p-5 shadow-soft">
          <h2 className="text-xl font-bold text-sanispa-navy">Mes factures</h2>
          <p className="mt-2 text-sanispa-steel">Les factures liées aux paiements seront ajoutées ici après raccordement complet avec Stripe Billing.</p>
        </section>
      </div>
    </AppShell>
  );
}
