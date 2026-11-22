"use client";

import { useState } from "react";
import { PrivateFile } from "./PrivateFile";

type Declaration = {
  answers: { id: string; label: string; value: string }[];
  photos: { id: string; label: string; url: string }[];
};

export function ClientDeclarationDetails({ load }: { load: () => Promise<Declaration> }) {
  const [declaration, setDeclaration] = useState<Declaration | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function fetchDeclaration() {
    if (declaration || loading) return;
    setLoading(true);
    setFailed(false);
    try {
      setDeclaration(await load());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <details className="mt-4 rounded-xl border border-sanispa-line px-4" onToggle={event => {
      if (event.currentTarget.open) void fetchDeclaration();
    }}>
      <summary className="focus-ring cursor-pointer rounded py-3 text-sm font-bold">Réponses et photos envoyées</summary>
      {loading ? <p className="pb-4 text-sm" role="status">Chargement des réponses et des photos…</p> : null}
      {failed ? <p className="mb-4 rounded-md bg-red-50 p-2 text-sm text-red-800" role="alert">
        Impossible de charger la déclaration.{" "}
        <button type="button" className="focus-ring font-bold underline" onClick={() => void fetchDeclaration()}>Réessayer</button>
      </p> : null}
      {declaration ? (
        <div className="space-y-5 border-t border-sanispa-line py-4 text-sm">
          <section>
            <h3 className="font-bold">Réponses au questionnaire</h3>
            {declaration.answers.length ? (
              <dl className="mt-3 grid gap-3">
                {declaration.answers.map(answer => (
                  <div key={answer.id} className="min-w-0">
                    <dt className="font-semibold">{answer.label}</dt>
                    <dd className="whitespace-pre-wrap break-words text-sanispa-steel">{answer.value}</dd>
                  </div>
                ))}
              </dl>
            ) : <p className="mt-2 text-sanispa-steel">Aucune réponse au questionnaire.</p>}
          </section>
          <section>
            <h3 className="font-bold">Photos envoyées</h3>
            {declaration.photos.length ? (
              <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {declaration.photos.map(photo => (
                  <li key={photo.id} className="min-w-0 rounded-lg bg-sanispa-ice p-3">
                    <p className="mb-2 font-semibold">{photo.label}</p>
                    <PrivateFile url={photo.url} name={photo.label} photo photoFit="contain" label="Télécharger la photo" />
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sanispa-steel">Aucune photo jointe à la déclaration.</p>}
          </section>
        </div>
      ) : null}
    </details>
  );
}
