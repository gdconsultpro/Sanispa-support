"use client";

import { Camera } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { StepHeader } from "@/components/StepHeader";
import { photoRequirements } from "@/lib/questions";
import { DiagnosticDraft } from "@/lib/types";
import { emptyDraft, readDraft, writeDraft } from "@/lib/storage";

export default function UploadPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<DiagnosticDraft>(emptyDraft);
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = readDraft();
    setDraft(stored);
    if (!stored.problemType) router.push("/diagnostic");
  }, [router]);

  function handleFile(photoId: string, file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setDraft((current) => ({
        ...current,
        photos: {
          ...current.photos,
          [photoId]: String(reader.result)
        }
      }));
    };
    reader.readAsDataURL(file);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const missingRequired = photoRequirements.some((photo) => photo.required && !draft.photos[photo.id]);
    if (missingRequired) {
      setError("La photo du clavier et la photo du compartiment technique sont obligatoires.");
      return;
    }
    writeDraft(draft);
    router.push("/resume");
  }

  return (
    <AppShell compact>
      <StepHeader
        eyebrow="Étape 3"
        title="Photos du spa"
        description="Ajoutez les photos nécessaires à l'analyse. Elles seront envoyées vers le stockage Supabase lors de la validation finale."
      />

      <form onSubmit={submit} className="space-y-4 rounded-md border border-sanispa-line bg-white p-4 shadow-soft sm:p-6">
        {photoRequirements.map((photo) => (
          <label key={photo.id} className="block rounded-md border border-sanispa-line p-4">
            <span className="mb-3 flex items-center gap-3 text-sm font-bold text-sanispa-navy">
              <Camera size={20} aria-hidden="true" />
              {photo.label}
              {photo.required ? <span className="text-sanispa-blue">*</span> : null}
            </span>
            <input
              className="focus-ring block w-full rounded-md border border-sanispa-line bg-sanispa-ice px-3 py-3 text-sm"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => handleFile(photo.id, event.target.files?.[0])}
            />
            {draft.photos[photo.id] ? (
              <img src={draft.photos[photo.id]} alt={photo.label} className="mt-4 h-36 w-full rounded-md object-cover" />
            ) : null}
          </label>
        ))}

        {error ? <p className="rounded-md bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
        <Button type="submit" className="w-full sm:w-auto">Voir le résumé</Button>
      </form>
    </AppShell>
  );
}
