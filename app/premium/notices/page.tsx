"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { clientRequest } from "@/lib/client-browser-api";

type Manual = {
  id: string;
  brand: string;
  model: string;
  title: string;
  source_url: string;
  source_kind: string;
};

type KeypadPhoto = { file: string; model: string };

// Use exact catalog references so a similar model never inherits the wrong image.
// Balboa and Gecko images come from their product pages and manuals. SpaNET
// product photos come from the labeled Spas Online catalogue.
const keypadPhotos: Record<string, KeypadPhoto[]> = {
  "Balboa · TP500 / TP500S": [
    { file: "balboa-tp500", model: "TP500" },
    { file: "balboa-tp500s", model: "TP500S" },
  ],
  "Balboa · SpaTouch 1 / SpaTouch 2": [
    { file: "balboa-spatouch1", model: "SpaTouch 1" },
    { file: "balboa-spatouch2", model: "SpaTouch 2" },
  ],
  "Balboa · SpaTouch 3": [
    { file: "balboa-spatouch3", model: "SpaTouch 3" },
  ],
  "Gecko · in.k300": [{ file: "gecko-ink300", model: "in.k300" }],
  "Gecko · in.k330": [{ file: "gecko-ink330", model: "in.k330" }],
  "Gecko · in.k600 / in.xm — interface interactive": [
    { file: "gecko-ink600", model: "in.k600 à menus" },
  ],
  "SpaNET · SV2 / SV3 / SV4": [
    { file: "spanet-sv3t", model: "SV3T" },
  ],
  "SpaNET · SV Mini 1 / SV Mini 2": [
    { file: "spanet-mini1", model: "SV Mini 1" },
    { file: "spanet-mini2", model: "SV Mini 2" },
  ],
};

function ManualCard({ manual }: { manual: Manual }) {
  const { brand, model, title, source_url, source_kind } = manual;
  const photos = keypadPhotos[`${brand} · ${model}`];
  return (
    <article className="grid min-w-0 gap-5 rounded-2xl border border-sanispa-line bg-white p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-center">
      <div>
        <p className="text-sm font-bold text-sanispa-blue">{brand} · {model} · Français</p>
        <h2 className="mt-2 text-xl font-bold">{title}</h2>
        <a href={source_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block font-bold underline">
          {source_kind === "manual" ? "Ouvrir la notice du fabricant" : "Consulter la documentation du fabricant"} ↗
        </a>
      </div>
      {photos ? (
        <div className={`grid gap-3 ${photos.length > 1 ? "grid-cols-2" : "sm:max-w-sm"}`}>
          {photos.map((photo) => {
            const src = `/notices/claviers/${photo.file}.webp`;
            return (
              <figure key={photo.file} className="min-w-0">
                <a
                  href={src}
                  target="_blank"
                  rel="noopener"
                  aria-label={`Agrandir le clavier ${brand} ${photo.model}`}
                  className="focus-ring relative block h-28 overflow-hidden rounded-xl border border-sanispa-line bg-white sm:h-36"
                >
                  <Image src={src} alt={`Clavier ${brand} ${photo.model}`} fill className="object-contain" sizes="(max-width: 767px) 85vw, 360px" />
                </a>
                <figcaption className="mt-1 text-center text-sm font-semibold">{photo.model}</figcaption>
              </figure>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}

export default function ManualsPage() {
  const [manuals, setManuals] = useState<Manual[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    clientRequest("/api/client/manuals", { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setManuals(result.manuals);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      });
    return () => controller.abort();
  }, []);

  const query = search.trim().toLowerCase();
  const filtered = manuals?.filter((manual) =>
    `${manual.brand} ${manual.model} ${manual.title}`.toLowerCase().includes(query),
  );

  return (
    <AppShell compact>
      <Link href="/premium" className="font-bold underline">← Mon espace spa</Link>
      <h1 className="mt-5 text-3xl font-bold">Les notices en français de mon spa</h1>
      <p className="mt-3 leading-7">
        Comparez votre clavier aux photos, puis vérifiez sa référence exacte avant d’ouvrir la notice.
      </p>
      {error ? (
        <p role="alert" className="mt-5 rounded-xl bg-white p-4 text-red-800">
          {error} <Link className="underline" href="/connexion?next=notices">Me connecter à mon compte</Link>
        </p>
      ) : null}
      {manuals ? (
        <>
          <label className="mt-5 block font-bold">
            Marque ou modèle
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ex. Balboa TP500, Gecko in.k300…" className="mt-2 w-full rounded-xl border border-sanispa-line bg-white p-3" />
          </label>
          <div className="mt-5 grid gap-4">
            {filtered?.map((manual) => <ManualCard key={manual.id} manual={manual} />)}
          </div>
          {!filtered?.length ? <p className="mt-4">Aucune notice en français vérifiée ne correspond à votre recherche.</p> : null}
          <Link href="/premium/assistant?topic=notices" className="mt-4 inline-block font-bold underline">
            Demander de l’aide pour identifier la référence →
          </Link>
        </>
      ) : !error ? <p role="status" className="mt-5">Chargement des notices…</p> : null}
    </AppShell>
  );
}
