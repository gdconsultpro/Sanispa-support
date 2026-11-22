"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/Button";
import { partnerAuthError } from "@/lib/partner-browser";
import { plannerRequest, PlannerRequestError } from "@/lib/partner-planner-browser";
import type { FieldStockItem, FieldStockUsage } from "@/lib/partner-stock-movements";

type StockView = { usage: FieldStockUsage[]; pieces: FieldStockItem[]; more: boolean };
const input = "focus-ring min-h-11 w-full min-w-0 rounded-lg border border-sanispa-line bg-white px-3 py-2 text-base";

export function PartnerFieldStock({ endpoint, session, editable, busy, onSaving }: {
  endpoint: string; session: string; editable: boolean; busy: boolean; onSaving: (value: boolean) => void;
}) {
  const [data, setData] = useState<StockView | null>(null);
  const [search, setSearch] = useState("");
  const [itemId, setItemId] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const retry = useRef<{ key: string; operation: string } | null>(null);
  const pending = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ stock: "1", search, ...(editable ? {} : { history: "1" }) });
    const timer = setTimeout(() => {
      void plannerRequest(endpoint + "?" + query, { signal: controller.signal }).then(result => {
        if (!controller.signal.aborted && result) { setData(result); setLoadError(""); }
      }).catch(cause => {
        if (!controller.signal.aborted) setLoadError(partnerAuthError(cause));
      });
    }, search ? 250 : 0);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [endpoint, editable, search, revision]);

  const used = data?.usage.filter(item => item.session_id === session) ?? [];
  const previous = data?.usage.filter(item => item.session_id !== session) ?? [];
  const pieces = data?.pieces.filter(piece => !used.some(item => item.stock_id === piece.id)) ?? [];
  const selected = pieces.find(item => item.id === itemId);

  async function save(event: FormEvent<HTMLFormElement>, stockId: string, expected: number) {
    event.preventDefault();
    if (!editable || pending.current || busy) return;
    const form = event.currentTarget;
    const quantity = Number(new FormData(form).get("quantity"));
    if (!stockId || !Number.isInteger(quantity) || quantity < (expected ? 0 : 1) || quantity > 1000000) return;
    const key = [session, stockId, expected, quantity].join(":");
    const operation = retry.current?.key === key ? retry.current.operation : crypto.randomUUID();
    retry.current = { key, operation };
    pending.current = true;
    onSaving(true);
    setSaveError("");
    setNotice("");
    try {
      if (!await plannerRequest(endpoint, { payload: { action: "stockUsage", session, stockId, operation, quantity, expected } })) return;
      retry.current = null;
      setNotice(quantity < expected ? "La différence a été remise en stock." : "Les pièces utilisées ont été enregistrées.");
      setEditing(null);
      setItemId("");
      form.reset();
      setRevision(value => value + 1);
    } catch (cause) {
      setSaveError(partnerAuthError(cause));
      if (cause instanceof PlannerRequestError && cause.status === 409) setRevision(value => value + 1);
    } finally {
      pending.current = false;
      onSaving(false);
    }
  }

  function list(items: FieldStockUsage[], canEdit: boolean) {
    return <ul className="mt-2 divide-y divide-sanispa-line">
      {items.map(item => <li key={item.session_id + item.stock_id} className="py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-4">
          <p className="min-w-0 break-words font-bold">{item.label}{item.reference ? " · " + item.reference : ""}</p>
          <span className="text-sm font-semibold">{item.used} utilisée{item.used > 1 ? "s" : ""}</span>
          {canEdit && editing !== item.stock_id ? <button type="button" disabled={busy}
            className="focus-ring min-h-11 text-sm font-bold text-sanispa-blue underline" onClick={() => setEditing(item.stock_id)}>Corriger la quantité</button> : null}
        </div>
        {canEdit && editing === item.stock_id ? <form key={item.used} className="mt-2 rounded-lg bg-sanispa-ice p-3" onSubmit={event => void save(event, item.stock_id, item.used)}>
          <fieldset disabled={busy} className="flex flex-wrap items-end gap-2">
            <label className="min-w-0 text-sm font-bold">Quantité réellement utilisée
              <input name="quantity" type="number" inputMode="numeric" required min={0} max={Math.min(1000000, item.used + item.available)}
                step={1} defaultValue={item.used} className={input + " mt-1"} />
            </label>
            <Button type="submit" variant="secondary">Enregistrer la correction</Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Annuler</Button>
          </fieldset>
          <p className="mt-1 text-sm">Saisissez 0 pour remettre toutes les pièces en stock.</p>
        </form> : null}
      </li>)}
    </ul>;
  }

  return <section id="pieces" className="scroll-mt-4 min-w-0 rounded-2xl border border-sanispa-line bg-white p-4 sm:p-5" aria-labelledby="pieces-heading">
    <h2 id="pieces-heading" className="text-lg font-bold">Pièces utilisées</h2>
    {loadError ? <div className="mt-2 text-sm text-red-800"><p role="alert">{loadError}</p>
      <button type="button" className="focus-ring min-h-11 font-bold underline" onClick={() => setRevision(value => value + 1)}>Réessayer</button>
    </div> : !data ? <p className="mt-2 text-sm" role="status">Chargement des pièces…</p> : null}
    {used.length ? list(used, editable) : data ? <p className="mt-1 text-sm">Aucune pièce enregistrée pour ce passage.</p> : null}
    {editable && data ? <form className="mt-3 rounded-lg bg-sanispa-ice p-3" onSubmit={event => void save(event, itemId, 0)}>
      <fieldset disabled={busy} className="grid min-w-0 gap-2 sm:grid-cols-2">
        <legend className="font-bold">Ajouter une pièce</legend>
        <label className="mt-1 min-w-0 text-sm font-bold sm:col-span-2">Rechercher par nom ou référence
          <input type="search" value={search} maxLength={100} className={input + " mt-1"}
            onChange={event => { setSearch(event.target.value); setItemId(""); }} />
        </label>
        <label className="min-w-0 text-sm font-bold">Pièce en stock
          <select className={input + " mt-1"} value={selected?.id ?? ""} onChange={event => setItemId(event.target.value)} required>
            <option value="">Choisir une pièce</option>
            {pieces.map(item => <option key={item.id} value={item.id}>
              {item.label}{item.reference ? " · " + item.reference : ""} ({item.quantity} en stock)
            </option>)}
          </select>
        </label>
        <label className="min-w-0 text-sm font-bold">Quantité utilisée
          <input name="quantity" type="number" min={1} max={selected?.quantity ?? 1000000} step={1}
            inputMode="numeric" defaultValue={1} required className={input + " mt-1"} />
        </label>
        {data.more ? <p className="text-sm sm:col-span-2">Affinez votre recherche pour retrouver les autres pièces.</p> : null}
        {!pieces.length ? <p className="text-sm sm:col-span-2">{search ? "Aucune pièce disponible pour cette recherche." : "Aucune autre pièce disponible en stock."}</p> : null}
        <div className="sm:col-span-2"><Button type="submit" disabled={!selected}>Enregistrer la sortie de stock</Button></div>
      </fieldset>
    </form> : null}
    {saveError ? <p role="alert" className="mt-2 text-sm font-bold text-red-800">{saveError}</p> : null}
    {notice ? <p role="status" className="mt-2 text-sm font-bold text-emerald-800">{notice}</p> : null}
    {previous.length ? <div className="mt-4 border-t border-sanispa-line pt-3">
      <h3 className="font-bold">Pièces utilisées lors des passages précédents</h3>
      {list(previous, false)}
    </div> : null}
  </section>;
}
