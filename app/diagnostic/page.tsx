"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { BackLink } from "@/components/BackLink";
import { Field, SelectField } from "@/components/Field";
import { StepHeader } from "@/components/StepHeader";
import { problemTypes } from "@/lib/questions";
import { DiagnosticDraft } from "@/lib/types";
import { emptyDraft, readDraft, writeDraft } from "@/lib/storage";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type Spa = {
  id: string;
  brand: string;
  model: string | null;
  spa_year: string | null;
  installation_type: string | null;
};

export default function DiagnosticPage() {
  return (
    <Suspense fallback={<AppShell compact><div className="rounded-md border border-sanispa-line bg-white p-5 text-sanispa-steel">Chargement du formulaire...</div></AppShell>}>
      <DiagnosticContent />
    </Suspense>
  );
}

function DiagnosticContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState<DiagnosticDraft>(emptyDraft);
  const [spas, setSpas] = useState<Spa[]>([]);
  const [selectedSpaId, setSelectedSpaId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const requestedProblem = searchParams.get("problemType") as DiagnosticDraft["problemType"];
    const savedDraft = readDraft();

    setDraft({
      ...savedDraft,
      problemType: requestedProblem || savedDraft.problemType
    });

    async function prefillFromClientAccount() {
      try {
        const supabase = getSupabaseBrowser();
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;

        const headers = { Authorization: `Bearer ${token}` };
        const [profileResponse, spasResponse] = await Promise.all([
          fetch("/api/client/profile", { headers }),
          fetch("/api/client/spas", { headers })
        ]);

        const profileData = await profileResponse.json();
        const spasData = await spasResponse.json();
        const profile = profileData.profile;
        const loadedSpas = spasData.spas ?? [];
        setSpas(loadedSpas);

        const firstSpa = loadedSpas[0];
        if (firstSpa) setSelectedSpaId(firstSpa.id);

        setDraft((current) => ({
          ...current,
          name: current.name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" "),
          phone: current.phone || profile?.phone || "",
          email: current.email || profile?.email || "",
          address: current.address || profile?.address || "",
          postalCode: current.postalCode || profile?.postal_code || "",
          city: current.city || profile?.city || "",
          spaBrand: current.spaBrand || firstSpa?.brand || profile?.spa_brand || "",
          spaModel: current.spaModel || firstSpa?.model || profile?.spa_model || "",
          spaYear: current.spaYear || firstSpa?.spa_year || profile?.spa_year || "",
          installationType: current.installationType || firstSpa?.installation_type || "",
          problemType: requestedProblem || current.problemType
        }));
      } catch {
        // Le formulaire reste disponible même si le client n'est pas connecté.
      }
    }

    prefillFromClientAccount();
  }, [searchParams]);

  const requiredFilled = useMemo(() => {
    return Boolean(
      draft.name &&
        draft.phone &&
        draft.email &&
        draft.postalCode &&
        draft.city &&
        draft.installationType &&
        draft.problemType
    );
  }, [draft]);

  function update<K extends keyof DiagnosticDraft>(key: K, value: DiagnosticDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function selectSpa(spaId: string) {
    setSelectedSpaId(spaId);
    const spa = spas.find((item) => item.id === spaId);
    if (!spa) return;

    setDraft((current) => ({
      ...current,
      spaBrand: spa.brand || "",
      spaModel: spa.model || "",
      spaYear: spa.spa_year || "",
      installationType: (spa.installation_type || "") as DiagnosticDraft["installationType"]
    }));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!requiredFilled) {
      setError("Veuillez renseigner tous les champs obligatoires avant de continuer.");
      return;
    }

    writeDraft({
      ...draft,
      spaBrand: draft.spaBrand || "Non renseignée",
      answers: draft.answers ?? {},
      photos: draft.photos ?? {}
    });
    router.push("/questionnaire");
  }

  return (
    <AppShell compact>
      <StepHeader
        eyebrow="Étape 1"
        title="Informations client et spa"
        description="Les champs sont préremplis si vous êtes connecté à votre espace client."
      />
      <BackLink href="/espace-client" label="Retour à mon espace client" />

      <form onSubmit={submit} className="space-y-5 rounded-md border border-sanispa-line bg-white p-4 shadow-soft sm:p-6">
        {spas.length > 0 ? (
          <SelectField
            label="Choisir le spa concerné"
            name="selectedSpa"
            value={selectedSpaId}
            onChange={selectSpa}
            options={spas.map((spa) => ({
              value: spa.id,
              label: [spa.brand, spa.model, spa.spa_year].filter(Boolean).join(" - ")
            }))}
          />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom" name="name" value={draft.name} onChange={(value) => update("name", value)} required />
          <Field label="Téléphone" name="phone" value={draft.phone} onChange={(value) => update("phone", value)} required type="tel" />
          <Field label="Email" name="email" value={draft.email} onChange={(value) => update("email", value)} required type="email" />
          <Field label="Adresse" name="address" value={draft.address} onChange={(value) => update("address", value)} />
          <Field label="Code postal" name="postalCode" value={draft.postalCode} onChange={(value) => update("postalCode", value)} required />
          <Field label="Ville" name="city" value={draft.city} onChange={(value) => update("city", value)} required />
          <Field label="Marque du spa si connue" name="spaBrand" value={draft.spaBrand} onChange={(value) => update("spaBrand", value)} />
          <Field label="Modèle si connu" name="spaModel" value={draft.spaModel} onChange={(value) => update("spaModel", value)} />
          <Field label="Année approximative si connue" name="spaYear" value={draft.spaYear} onChange={(value) => update("spaYear", value)} />
          <SelectField
            label="Type d'installation"
            name="installationType"
            value={draft.installationType}
            onChange={(value) => update("installationType", value as DiagnosticDraft["installationType"])}
            required
            options={[
              { value: "interieur", label: "Intérieur" },
              { value: "exterieur", label: "Extérieur" }
            ]}
          />
          <SelectField
            label="Type de problème"
            name="problemType"
            value={draft.problemType}
            onChange={(value) => update("problemType", value as DiagnosticDraft["problemType"])}
            required
            options={problemTypes}
          />
        </div>

        {error ? <p className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
        <Button type="submit" className="w-full sm:w-auto">Continuer vers le questionnaire</Button>
      </form>
    </AppShell>
  );
}
