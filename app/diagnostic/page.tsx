"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ProblemPicker } from "@/components/ProblemPicker";
import { DraftSave } from "@/components/DraftSave";
import { AppShell } from "@/components/AppShell";
import { Button, ButtonLink } from "@/components/Button";
import { BackLink } from "@/components/BackLink";
import { Field, SelectField } from "@/components/Field";
import { StepHeader } from "@/components/StepHeader";
import { normalizeDiagnostic } from "@/lib/diagnostic-answers";
import { DiagnosticQuestion } from "@/components/DiagnosticQuestion";
import { DiagnosticContactFields } from "@/components/DiagnosticContactFields";
import { missingContactFields } from "@/lib/diagnostic-contact";
import { isQuestionVisible, updateDiagnosticAnswer, validateAnswers } from "@/lib/diagnostic-answers";
import { problemTypes, questionSets } from "@/lib/questions";
import { DiagnosticDraft } from "@/lib/types";
import {
  emptyDraft,
  readDraft,
  readLocalProgress,
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
        <AppShell compact declarationFlow>
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
  const [accountEmail, setAccountEmail] = useState("");
  const [ready, setReady] = useState(false);
  const [otherSpa, setOtherSpa] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [reset, setReset] = useState(0);
  useEffect(() => {
    const requestedProblem = problemTypes.find(
      (p) => p.value === searchParams.get("problemType"),
    )?.value;
    let active = true;
    const url = new URL(window.location.href);
    if (url.searchParams.get("new") === "1") {
      if (readLocalProgress()?.pending) {
        setConfirmNew(true);
        return;
      }
      clearDraft();
      url.searchParams.delete("new");
      window.history.replaceState(null, "", url);
    }
    setConfirmNew(false);
    const savedDraft = readDraft();
    const initial = normalizeDiagnostic({ ...savedDraft, problemType: savedDraft.problemType || requestedProblem || "" });
    async function prefillFromClientAccount() {
      let draft = initial;
      let email = "";
      let loadedSpas: Spa[] = [];
      try {
        const supabase = getSupabaseBrowser();
        const { data } = await supabase.auth.getSession();
        const session = data.session;
        if (active && session?.user.email_confirmed_at && session.user.email) {
          email = session.user.email;
          draft = { ...initial, email };
          const headers = { Authorization: `Bearer ${session.access_token}` };
          const [profileResult, spasResult] = await Promise.allSettled(
            ["/api/client/profile", "/api/client/spas"].map(async path => {
              const response = await fetch(path, { headers, signal: AbortSignal.timeout(10000) });
              if (!response.ok) throw new Error("Informations indisponibles");
              return response.json();
            }),
          );
          const profile = profileResult.status === "fulfilled" ? profileResult.value.profile : undefined;
          loadedSpas = spasResult.status === "fulfilled" ? spasResult.value.spas ?? [] : [];
          const linkedSpa = loadedSpas.find(spa => spa.id === initial.spaId);
          const onlySpa = !initial.draftId && !initial.spaId && !hasSpaDetails(initial) && loadedSpas.length === 1 ? loadedSpas[0] : undefined;
          const spa = linkedSpa || onlySpa;
          draft = {
            ...draft,
            spaId: spasResult.status === "fulfilled" ? spa?.id : initial.spaId,
            name: initial.name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" "),
            phone: initial.phone || profile?.phone || "",
            address: initial.address || profile?.address || "",
            postalCode: initial.postalCode || profile?.postal_code || "",
            city: initial.city || profile?.city || "",
            spaBrand: initial.spaBrand || spa?.brand || "",
            spaModel: initial.spaModel || spa?.model || "",
            spaYear: initial.spaYear || spa?.spa_year || "",
            installationType: initial.installationType || savedInstallation(spa),
          };
        }
      } catch {
        // Une session indisponible ne bloque pas le parcours public.
      }
      if (!active) return;
      setDraft(draft);
      setAccountEmail(email);
      setSpas(loadedSpas);
      setOtherSpa(false);
      setReady(true);
    }
    prefillFromClientAccount();
    return () => { active = false; };
  }, [searchParams, reset]);
  const moving = draft.problemType === "demenagement";
  const publicBreakdown = !moving && !accountEmail;
  const showContact = moving;
  const selectedSpa = spas.find(spa => spa.id === draft.spaId);
  const manualSpa = otherSpa || (!selectedSpa && hasSpaDetails(draft));
  const showSpaFields = moving || !accountEmail || !spas.length || manualSpa;
  const showInstallation = showSpaFields || !savedInstallation(selectedSpa);
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
    const spa = spas.find((item) => item.id === spaId);
    setOtherSpa(spaId === "autre");
    setDraft((current) => ({
      ...current,
      spaId: spa?.id,
      spaBrand: spa?.brand || "",
      spaModel: spa?.model || "",
      spaYear: spa?.spa_year || "",
      installationType: savedInstallation(spa),
      powerSupply: "",
    }));
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (!draft.problemType || (!publicBreakdown && !draft.installationType) || (showContact && missingContactFields(draft).length)) {
      setError(
        "Veuillez renseigner tous les champs obligatoires avant de continuer.",
      );
      return;
    }
    setBusy(true);
    try {
      if (moving) validateAnswers(draft, false);
      const { data } = await getSupabaseBrowser().auth.getSession();
      if (accountEmail && !data.session?.user.email_confirmed_at)
        throw new Error("Reconnectez-vous pour poursuivre votre déclaration.");
      const next = {
        ...draft,
        ...(moving ? { address: String(draft.answers.moving_departure || ""), choice: "devis" as const, paymentPlan: "" as const } : {}),
        draftId: draft.draftId || crypto.randomUUID(),
        email: data.session?.user.email_confirmed_at ? data.session.user.email || draft.email : draft.email,
      };
      const destination = moving ? "/upload" : "/questionnaire";
      if (!data.session?.user.email_confirmed_at) {
        writeDraft(next, destination);
        router.push(moving ? "/acces?next=diagnostic" : destination);
        return;
      }
      await saveDraft(next, destination);
      router.push(destination);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sauvegarde impossible.");
    } finally {
      setBusy(false);
    }
  }
  const installationField = (
    <SelectField label="Type d’installation" name="installationType" value={draft.installationType}
      onChange={value => update("installationType", value as DiagnosticDraft["installationType"])}
      required options={[{ value: "interieur", label: "Intérieur" }, { value: "exterieur", label: "Extérieur" }]} />
  );
  const spaFields = (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Marque du spa si connue" name="spaBrand" value={draft.spaBrand} onChange={value => update("spaBrand", value)} />
      <Field label="Modèle si connu" name="spaModel" value={draft.spaModel} onChange={value => update("spaModel", value)} />
      <Field label="Année approximative si connue" name="spaYear" value={draft.spaYear} onChange={value => update("spaYear", value)} />
    </div>
  );
  if (confirmNew) return <AppShell compact declarationFlow>
    <section className="max-w-xl rounded-2xl border border-sanispa-line bg-white p-5">
      <h1 className="text-2xl font-bold">Une déclaration est déjà en cours</h1>
      <p className="my-3">Reprenez votre brouillon ou remplacez-le par une nouvelle demande.</p>
      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/reprendre?local=1">Reprendre ma déclaration</ButtonLink>
        <Button type="button" variant="secondary" onClick={() => {
          clearDraft();
          setConfirmNew(false);
          setReset(value => value + 1);
        }}>Commencer une nouvelle demande</Button>
      </div>
    </section>
  </AppShell>;
  if (!ready) return <AppShell compact declarationFlow><p role="status">Chargement de votre déclaration…</p></AppShell>;
  return (
    <AppShell compact declarationFlow>
      <div className="mx-auto max-w-5xl">
        <StepHeader
          eyebrow="Étape 1"
          labels={moving ? ["Le transport", "Photos et vidéos", "La validation"] : undefined}
          title={moving ? "Préparer le déménagement de mon spa" : "Déclarer une panne"}
          description={moving ? "Décrivez le spa, le trajet et les accès aux deux adresses. Vos photos et vidéos permettront à SANISPA d’étudier la faisabilité et de préparer un devis. Aucune réservation ni facturation à cette étape." : accountEmail ? "Vous pourrez vérifier vos coordonnées avant l’envoi." : "Vous pourrez décrire la panne avant de créer votre compte."}
        />
        <DraftSave draft={draft} step="/diagnostic" sync={Boolean(accountEmail && draft.email === accountEmail)} />
        <BackLink href="/espace-client" label="Retour à mon espace client" />

        <form
          onSubmit={submit}
          className="space-y-6 rounded-xl border border-sanispa-line bg-white px-4 py-5 sm:px-8 sm:py-8"
        >
          {moving ? <p className="rounded-xl bg-sanispa-ice p-4 font-bold">Déménagement de spa · Étude de faisabilité et devis</p> : <ProblemPicker
            value={draft.problemType}
            onChange={(value) => update("problemType", value)}
          />}
          {!publicBreakdown ? <>
          <h2 className="sanispa-display-title text-2xl">
            {moving ? "Vos coordonnées et le lieu d’enlèvement" : showContact ? "Votre spa et vos coordonnées" : "Le spa concerné"}
          </h2>
          {spas.length > 0 ? (
            <SelectField
              label="Choisir le spa concerné"
              name="selectedSpa"
              value={selectedSpa?.id || (manualSpa ? "autre" : "")}
              onChange={selectSpa}
              required={Boolean(accountEmail)}
              options={[...spas.map((spa) => ({
                value: spa.id,
                label: [spa.brand, spa.model, spa.spa_year]
                  .filter(Boolean)
                  .join(" - "),
              })), { value: "autre", label: "Un autre spa" }]}
            />
          ) : null}

          {showContact ? <DiagnosticContactFields draft={draft} moving={moving} readOnlyEmail={Boolean(accountEmail)} onChange={update} /> : null}
          {showSpaFields || selectedSpa ? (
            <div className="space-y-4">
              {showInstallation ? installationField : null}
              {accountEmail && !moving ? (
                <details key={draft.spaId || "autre"} className="rounded-xl border border-sanispa-line p-4">
                  <summary className="cursor-pointer font-bold">{selectedSpa ? "Modifier les infos du spa pour cette demande" : "Ajouter la marque, le modèle ou l’année"}</summary>
                  <div className="mt-4 space-y-4">
                    {spaFields}
                    {!showInstallation ? installationField : null}
                  </div>
                </details>
              ) : spaFields}
            </div>
          ) : null}

          </> : null}

          {moving ? <div className="space-y-5 border-t border-sanispa-line pt-6">{questionSets.demenagement.filter(q => isQuestionVisible(q, draft.answers, questionSets.demenagement)).map(q => <div key={q.id} className="space-y-3">{q.section ? <h2 className="text-xl font-bold">{q.section}</h2> : null}<DiagnosticQuestion question={q} value={draft.answers[q.id]} onChange={value => { setError(""); setDraft(current => ({ ...updateDiagnosticAnswer(current, q.id, value), ...(q.id === "moving_departure" ? { address: String(value) } : {}) })); }} /></div>)}<p className="rounded-xl bg-sanispa-ice p-4 text-sm leading-6">Ne déplacez pas le spa pour répondre. Le poids, les dimensions et les moyens de levage seront confirmés par le professionnel avant le transport.</p></div> : null}
          {error ? (
            <p role="alert" className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">
              {error}
            </p>
          ) : null}
          {!accountEmail && moving ? <p className="text-sm text-sanispa-steel">
            Vous pourrez créer votre compte avec un mot de passe. L’e-mail de confirmation vous ramènera à votre demande.
          </p> : null}
          <Button type="submit" disabled={busy} className="diagnostic-submit w-full sm:w-auto">
            {busy ? "Préparation de votre parcours…" : moving ? "Ajouter mon dossier photo ou vidéo" : "Continuer ma déclaration"}
          </Button>
        </form>
      </div>
    </AppShell>
  );
}

function hasSpaDetails(draft: DiagnosticDraft) {
  return Boolean(draft.spaBrand || draft.spaModel || draft.spaYear || draft.installationType);
}

function savedInstallation(spa?: Spa) {
  return spa?.installation_type === "interieur" || spa?.installation_type === "exterieur" ? spa.installation_type : "";
}
