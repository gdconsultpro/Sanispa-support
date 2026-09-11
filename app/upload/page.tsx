"use client";
import { missingRequiredPhotos, normalizeDiagnostic, updateDiagnosticAnswer } from "@/lib/diagnostic-answers";
import { DiagnosticQuestion } from "@/components/DiagnosticQuestion";
import { compressPhoto } from "@/lib/compress-photo";
import { Camera } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DraftSave } from "@/components/DraftSave";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { BackLink } from "@/components/BackLink";
import { StepHeader } from "@/components/StepHeader";
import { getPhotoRequirements, isPhotoRequired, photoUnavailableQuestion, photoUnavailableDetail } from "@/lib/questions";
import { DiagnosticDraft } from "@/lib/types";
import { emptyDraft, readDraft, saveDraft } from "@/lib/storage";
export default function UploadPage() {
    const router = useRouter();
    const [draft, setDraft] = useState<DiagnosticDraft>(emptyDraft);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState("");
    useEffect(() => {
        const stored = readDraft();
        setDraft(stored);
        if (!stored.problemType)
            router.push("/diagnostic");
    }, [router]);
    const photos = getPhotoRequirements(draft.problemType, draft.photos);
    async function handleFile(photoId: string, file?: File) {
        if (!file)
            return;
        if (!draft.photos[photoId] && Object.values(draft.photos).filter(Boolean).length >= 5) {
            setError("Vous pouvez joindre 5 photos. Retirez une photo avant d’en ajouter une autre.");
            return;
        }
        setProcessing(true);
        setError("");
        try {
            const photo = await compressPhoto(file);
            setDraft(current => normalizeDiagnostic({ ...current, photos: { ...current.photos, [photoId]: photo } }));
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Lecture de la photo impossible.");
        }
        finally {
            setProcessing(false);
        }
    }
    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const missingPhotos = missingRequiredPhotos(draft);
        if (missingPhotos.length) {
            setError(`Ajoutez la photo obligatoire ou renseignez son impossibilité avant de continuer : ${missingPhotos.map(photo => photo.label).join(" ; ")}.`);
            return;
        }
        try {
            await saveDraft(draft, "/resume");
            router.push("/resume");
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Sauvegarde impossible.");
        }
    }
    return (<AppShell compact>
      <StepHeader eyebrow="Étape 3" title="Photos du spa" description="Les photos marquées d’un * sont obligatoires. Formats acceptés : JPG, PNG ou WebP, 20 Mo maximum par photo, 5 photos maximum. Ne démontez rien pour prendre une photo ; laissez les éléments inaccessibles de côté. Elles sont réduites automatiquement. Attendez la confirmation de sauvegarde avant de quitter la page."/>
      <DraftSave draft={draft} step="/upload"/>
      <BackLink href="/questionnaire"/>

      <form onSubmit={submit} className="space-y-4 rounded-md border border-sanispa-line bg-white p-4 shadow-soft sm:p-6">
        {photos.map((photo) => (<div key={photo.id} className="block rounded-md border border-sanispa-line p-4">
            <span className="mb-3 flex items-center gap-3 text-sm font-bold text-sanispa-navy">
              <Camera size={20} aria-hidden="true"/>
              {photo.label}
              {isPhotoRequired(photo.id, draft.problemType) ? <span className="text-sanispa-blue">*</span> : null}
            </span>
            <input aria-label={photo.label} className="focus-ring block w-full rounded-md border border-sanispa-line bg-sanispa-ice px-3 py-3 text-sm" type="file" accept="image/jpeg,image/png,image/webp" disabled={processing} onChange={(event) => handleFile(photo.id, event.target.files?.[0])}/>
            {draft.photos[photo.id] ? (<img src={draft.photos[photo.id]} alt={photo.label} className="mt-4 h-36 w-full rounded-md object-cover"/>) : null}
            {draft.photos[photo.id] ? <button type="button" className="focus-ring mt-3 min-h-11 text-sm font-semibold text-sanispa-blue" disabled={processing} onClick={() => setDraft(current => {
              const nextPhotos = { ...current.photos }; delete nextPhotos[photo.id];
              return normalizeDiagnostic({ ...current, photos: nextPhotos });
            })}>Retirer cette photo</button> : null}
          </div>))}

        {draft.problemType === "electrique" && !draft.photos.keyboard ? <section className="space-y-4 rounded-md border border-sanispa-line p-4">
          <h2 className="font-bold">Photo du clavier impossible à fournir</h2>
          <p className="text-sm text-sanispa-steel">La photo du clavier est demandée pour ce problème. Si vous ne pouvez pas la fournir, indiquez le motif ; cette absence sera transmise à SANISPA avec le dossier.</p>
          <DiagnosticQuestion question={photoUnavailableQuestion} value={draft.answers.keyboard_photo_unavailable} onChange={value => setDraft(current => updateDiagnosticAnswer(current, "keyboard_photo_unavailable", value))} />
          {draft.answers.keyboard_photo_unavailable === "Autre impossibilité" ? <DiagnosticQuestion question={photoUnavailableDetail} value={draft.answers.keyboard_photo_unavailable_detail} onChange={value => setDraft(current => updateDiagnosticAnswer(current, "keyboard_photo_unavailable_detail", value))} /> : null}
        </section> : null}
        {error ? <p className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
        <Button disabled={processing} type="submit" className="w-full sm:w-auto">Voir le résumé</Button>
      </form>
    </AppShell>);
}
