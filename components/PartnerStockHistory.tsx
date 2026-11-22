"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { partnerAuthError } from "@/lib/partner-browser";
import { plannerRequest } from "@/lib/partner-planner-browser";
import { partnerPrivateVisitPath } from "@/lib/partner-planner";
import { stockMovementLabels, type StockMovement } from "@/lib/partner-stock-movements";

const dateLabel = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });
const countLabel = new Intl.NumberFormat("fr-FR");

export function PartnerStockHistory({ article, clear }: { article: { id: string; label: string } | null; clear: () => void }) {
  const [movements, setMovements] = useState<StockMovement[] | null>(null);
  const [cursor, setCursor] = useState<{ before: string; cursor: string } | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const articleId = article?.id;
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ section: "stock-movements", ...(articleId ? { article: articleId } : {}), ...(cursor ?? {}) });
    void plannerRequest("/api/partner/planning?" + query, { signal: controller.signal }).then(result => {
      if (controller.signal.aborted || !result) return;
      setMovements(current => cursor ? [...(current ?? []), ...result.movements] : result.movements);
      setMore(result.more);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(partnerAuthError(cause));
    }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [articleId, cursor, retry]);

  return <section id="stock-movements" className="scroll-mt-4 min-w-0 rounded-2xl border border-sanispa-line bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-xl font-bold">Historique des mouvements</h2>
      {article ? <Button type="button" variant="secondary" onClick={clear}>Tous les articles</Button> : null}
    </div>
    {article ? <p className="mt-1 break-words text-sm font-semibold">{article.label}</p> : null}
    {busy && movements === null ? <p className="mt-3 text-sm" role="status">Chargement de l’historique…</p> : null}
    {error ? <div className="mt-2 text-sm text-red-800"><p role="alert">{error}</p>
      <button type="button" className="focus-ring min-h-11 font-bold underline" onClick={() => {
        setError(""); setBusy(true); setRetry(value => value + 1);
      }}>Réessayer</button>
    </div> : null}
    {movements?.length ? <ul className="mt-2 divide-y divide-sanispa-line">
      {movements.map(item => {
        const fieldPath = item.field_visit_id && item.field_source
          ? (item.field_source === "private" ? partnerPrivateVisitPath(item.field_visit_id) : "/partenaire/interventions/" + item.field_visit_id)
          : null;
        return <li key={item.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-2 py-3">
          <div className="min-w-0">
            <p className="break-words font-bold">{item.label}{item.reference ? " · " + item.reference : ""}</p>
            <p className="text-sm">{stockMovementLabels[item.kind]} · <time dateTime={item.created_at}>{dateLabel.format(new Date(item.created_at))}</time></p>
            {fieldPath ? <Link href={fieldPath + "#pieces"} className="focus-ring inline-flex min-h-11 items-center text-sm font-bold text-sanispa-blue underline">
              {item.field_source === "private" ? "Voir l’intervention" : "Voir le dossier SANISPA"}
            </Link> : null}
          </div>
          <div className="text-right text-sm">
            <strong className={item.delta < 0 ? "text-amber-900" : "text-emerald-800"}>
              {item.delta < 0 ? "−" : "+"}{countLabel.format(Math.abs(item.delta))}
            </strong>
            <p>{countLabel.format(item.quantity_after)} après mouvement</p>
          </div>
        </li>;
      })}
    </ul> : movements ? <p className="mt-3 text-sm">Aucun mouvement enregistré.</p> : null}
    {more && movements?.length ? <Button type="button" variant="secondary" disabled={busy || Boolean(error)} onClick={() => {
      const last = movements[movements.length - 1];
      setBusy(true);
      setCursor({ before: last.created_at, cursor: last.id });
    }}>{busy ? "Chargement…" : "Afficher les mouvements précédents"}</Button> : null}
  </section>;
}
