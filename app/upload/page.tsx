"use client";
import { compressPhoto } from "@/lib/compress-photo";
import { Camera } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DraftSave } from "@/components/DraftSave";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { BackLink } from "@/components/BackLink";
import { StepHeader } from "@/components/StepHeader";
import { getPhotoRequirements, isPhotoRequired } from "@/lib/questions";
import { DiagnosticDraft } from "@/lib/types";
import { emptyDraft, readDraft, writeDraft, saveDraft } from "@/lib/storage";
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
    const photos = getPhotoRequirements(draft.problemType);
    async function handleFile(photoId: string, file?: File) {
        if (!file)
            return;
        setProcessing(true);
        setError("");
        try {
            const photo = await compressPhoto(file);
            setDraft(current => ({ ...current, photos: { ...current.photos, [photoId]: photo } }));
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
        const missingPhotos = photos.filter((photo) => isPhotoRequired(photo.id, draft.problemType) && !draft.photos[photo.id]);
        if (missingPhotos.length) {
            setError(`Ajoutez les photos obligatoires avant de continuer : ${missingPhotos.map(photo => photo.label).join(" ; ")}.`);
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
      <StepHeader eyebrow="Étape 3" title="Photos du spa" description="Les photos marquées d’un * sont obligatoires. Formats acceptés : JPG, PNG ou WebP, 20 Mo maximum par photo. Elles sont réduites automatiquement. Attendez la confirmation de sauvegarde avant de quitter la page."/>
      <DraftSave draft={draft} step="/upload"/>
      <BackLink href="/questionnaire"/>

      <form onSubmit={submit} className="space-y-4 rounded-md border border-sanispa-line bg-white p-4 shadow-soft sm:p-6">
        {photos.map((photo) => (<label key={photo.id} className="block rounded-md border border-sanispa-line p-4">
            <span className="mb-3 flex items-center gap-3 text-sm font-bold text-sanispa-navy">
              <Camera size={20} aria-hidden="true"/>
              {photo.label}
              {isPhotoRequired(photo.id, draft.problemType) ? <span className="text-sanispa-blue">*</span> : null}
            </span>
            <input className="focus-ring block w-full rounded-md border border-sanispa-line bg-sanispa-ice px-3 py-3 text-sm" type="file" accept="image/jpeg,image/png,image/webp" disabled={processing} onChange={(event) => handleFile(photo.id, event.target.files?.[0])}/>
            {draft.photos[photo.id] ? (<img src={draft.photos[photo.id]} alt={photo.label} className="mt-4 h-36 w-full rounded-md object-cover"/>) : null}
          </label>))}

        {error ? <p className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
        <Button disabled={processing} type="submit" className="w-full sm:w-auto">Voir le résumé</Button>
      </form>
    </AppShell>);
}
