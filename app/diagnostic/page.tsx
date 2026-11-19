"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ProblemPicker } from "@/components/ProblemPicker";
import { DraftSave } from "@/components/DraftSave";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { BackLink } from "@/components/BackLink";
import { Field, SelectField } from "@/components/Field";
import { StepHeader } from "@/components/StepHeader";
import { normalizeDiagnostic } from "@/lib/diagnostic-answers";
import { DiagnosticQuestion } from "@/components/DiagnosticQuestion";
import { isQuestionVisible, updateDiagnosticAnswer, validateAnswers } from "@/lib/diagnostic-answers";
import { problemTypes, questionSets } from "@/lib/questions";
import { DiagnosticDraft } from "@/lib/types";
import {
  emptyDraft,
  readDraft,
  writeDraft,
  saveDraft,
  clearDraft,
} from "@/lib/storage";
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
    <Suspense
      fallback={
        <AppShell compact>
          <div className="rounded-md border border-sanispa-line bg-white p-5 text-sanispa-steel">
            Chargement du formulaire...
          </div>
        </AppShell>
      }
    >
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
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const requestedProblem = problemTypes.find(
      (p) => p.value === searchParams.get("problemType"),
    )?.value;
    if (searchParams.get("new") === "1") clearDraft();
    const savedDraft = readDraft();
    setDraft(
      normalizeDiagnostic({
        ...savedDraft,
        problemType: requestedProblem || savedDraft.problemType,
      }),
    );
    async function prefillFromClientAccount() {
      try {
        const supabase = getSupabaseBrowser();
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const headers = { Authorization: `Bearer ${token}` };
        const [profileResponse, spasResponse] = await Promise.all([
          fetch("/api/client/profile", { headers }),
          fetch("/api/client/spas", { headers }),
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
          name:
            current.name ||
            [profile?.first_name, profile?.last_name].filter(Boolean).join(" "),
          phone: current.phone || profile?.phone || "",
          email: current.email || profile?.email || "",
          address: current.address || profile?.address || "",
          postalCode: current.postalCode || profile?.postal_code || "",
          city: current.city || profile?.city || "",
          spaBrand:
            current.spaBrand || firstSpa?.brand || profile?.spa_brand || "",
          spaModel:
            current.spaModel || firstSpa?.model || profile?.spa_model || "",
          spaYear:
            current.spaYear || firstSpa?.spa_year || profile?.spa_year || "",
          installationType:
            current.installationType || firstSpa?.installation_type || "",
          problemType: requestedProblem || current.problemType,
        }));
      } catch {
        // Le formulaire reste disponible même si le client n'est pas connecté.
      }
    }
    prefillFromClientAccount();
  }, [searchParams]);
  const moving = draft.problemType === "demenagement";
  const requiredFilled = useMemo(() => {
    return Boolean(
      draft.name &&
        draft.phone &&
        draft.email &&
        draft.postalCode &&
        draft.city &&
        draft.installationType &&
        draft.problemType,
    );
  }, [draft]);
  function update<K extends keyof DiagnosticDraft>(
    key: K,
    value: DiagnosticDraft[K],
  ) {
    setDraft((current) =>
      normalizeDiagnostic({
        ...current,
        [key]: value,
        ...(key === "problemType" && value !== current.problemType
          ? { choice: "" as const, paymentPlan: "" as const }
          : {}),
      }),
    );
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
      installationType: (spa.installation_type ||
        "") as DiagnosticDraft["installationType"],
    }));
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (!requiredFilled) {
      setError(
        "Veuillez renseigner tous les champs obligatoires avant de continuer.",
      );
      return;
    }
    setBusy(true);
    try {
      if (moving) validateAnswers(draft, false);
      const next = {
        ...draft,
        ...(moving ? { address: String(draft.answers.moving_departure || ""), choice: "devis" as const, paymentPlan: "" as const } : {}),
        draftId: draft.draftId || crypto.randomUUID(),
        spaId: selectedSpaId || undefined,
      };
      writeDraft(next);
      const { data } = await getSupabaseBrowser().auth.getSession();
      if (!data.session?.user.email_confirmed_at) {
        router.push("/acces?next=diagnostic");
        return;
      }
      const destination = moving ? "/upload" : "/questionnaire";
      await saveDraft(next, destination);
      router.push(destination);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sauvegarde impossible.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppShell compact>
      <StepHeader
        eyebrow="Étape 1"
        labels={moving ? ["Le transport", "Photos et vidéos", "La validation"] : undefined}
        title={moving ? "Préparer le déménagement de mon spa" : "Informations client et spa"}
        description={moving ? "Décrivez le spa, le trajet et les accès aux deux adresses. Vos photos et vidéos permettront à SANISPA d’étudier la faisabilité et de préparer un devis. Aucune réservation ni facturation à cette étape." : "Les champs marqués d’un * sont obligatoires ; les autres sont facultatifs. Vos informations peuvent être préremplies après connexion. Vous pourrez enregistrer votre brouillon dans votre espace client avant d’envoyer la demande."}
      />
      <DraftSave draft={draft} step="/diagnostic" />
      <BackLink href="/espace-client" label="Retour à mon espace client" />

      <form
        onSubmit={submit}
        className="space-y-5 rounded-md border border-sanispa-line bg-white p-4 shadow-soft sm:p-6"
      >
        {moving ? <p className="rounded-xl bg-sanispa-ice p-4 font-bold">Déménagement de spa · Étude de faisabilité et devis</p> : <ProblemPicker
          value={draft.problemType}
          onChange={(value) => update("problemType", value)}
        />}
        <h2 className="border-t border-sanispa-line pt-6 text-xl font-bold">
          {moving ? "Vos coordonnées et le lieu d’enlèvement" : "Votre spa et vos coordonnées"}
        </h2>
        {spas.length > 0 ? (
          <SelectField
            label="Choisir le spa concerné"
            name="selectedSpa"
            value={selectedSpaId}
            onChange={selectSpa}
            options={spas.map((spa) => ({
              value: spa.id,
              label: [spa.brand, spa.model, spa.spa_year]
                .filter(Boolean)
                .join(" - "),
            }))}
          />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Nom"
            name="name"
            value={draft.name}
            onChange={(value) => update("name", value)}
            required
          />
          <Field
            label="Téléphone"
            name="phone"
            value={draft.phone}
            onChange={(value) => update("phone", value)}
            required
            type="tel"
          />
          <Field
            label="Adresse e-mail"
            name="email"
            value={draft.email}
            onChange={(value) => update("email", value)}
            required
            type="email"
          />
          {!moving ? <Field
            label="Adresse"
            name="address"
            value={draft.address}
            onChange={(value) => update("address", value)}
          /> : null}
          <Field
            label={moving ? "Code postal d’enlèvement" : "Code postal"}
            name="postalCode"
            value={draft.postalCode}
            onChange={(value) => update("postalCode", value)}
            required
          />
          <Field
            label={moving ? "Ville d’enlèvement" : "Ville"}
            name="city"
            value={draft.city}
            onChange={(value) => update("city", value)}
            required
          />
          <Field
            label="Marque du spa si connue"
            name="spaBrand"
            value={draft.spaBrand}
            onChange={(value) => update("spaBrand", value)}
          />
          <Field
            label="Modèle si connu"
            name="spaModel"
            value={draft.spaModel}
            onChange={(value) => update("spaModel", value)}
          />
          <Field
            label="Année approximative si connue"
            name="spaYear"
            value={draft.spaYear}
            onChange={(value) => update("spaYear", value)}
          />
          <SelectField
            label="Type d'installation"
            name="installationType"
            value={draft.installationType}
            onChange={(value) =>
              update(
                "installationType",
                value as DiagnosticDraft["installationType"],
              )
            }
            required
            options={[
              { value: "interieur", label: "Intérieur" },
              { value: "exterieur", label: "Extérieur" },
            ]}
          />
        </div>

        {moving ? <div className="space-y-5 border-t border-sanispa-line pt-6">{questionSets.demenagement.filter(q => isQuestionVisible(q, draft.answers, questionSets.demenagement)).map(q => <div key={q.id} className="space-y-3">{q.section ? <h2 className="text-xl font-bold">{q.section}</h2> : null}<DiagnosticQuestion question={q} value={draft.answers[q.id]} onChange={value => { setError(""); setDraft(current => ({ ...updateDiagnosticAnswer(current, q.id, value), ...(q.id === "moving_departure" ? { address: String(value) } : {}) })); }} /></div>)}<p className="rounded-xl bg-sanispa-ice p-4 text-sm leading-6">Ne déplacez pas le spa pour répondre. Le poids, les dimensions et les moyens de levage seront confirmés par le professionnel avant le transport.</p></div> : null}
        {error ? (
          <p className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">
            {error}
          </p>
        ) : null}
        <p className="text-sm text-sanispa-steel">
          Si vous n’êtes pas connecté, vous créerez votre compte avec un mot de passe.
          Un seul e-mail confirmera votre adresse et vous ramènera à votre demande.
        </p>
        <Button type="submit" disabled={busy} className="w-full sm:w-auto">
          {busy ? "Préparation de votre parcours…" : moving ? "Ajouter mon dossier photo ou vidéo" : "Continuer ma déclaration"}
        </Button>
      </form>
    </AppShell>
  );
}
