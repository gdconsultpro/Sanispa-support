"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminClientsPath } from "@/lib/admin-navigation";
import type { AdminClientAccount } from "@/lib/types";

const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" });
const button = "focus-ring min-h-11 rounded-md border px-3 py-2 text-sm font-bold disabled:opacity-50";
const actions = {
  block: { label: "Bloquer", text: "Toutes les sessions de ce client seront fermées. Vous pourrez rétablir son accès.", success: "Compte client bloqué." },
  unblock: { label: "Débloquer", text: "Le client pourra se reconnecter.", success: "Compte client débloqué." },
  delete: { label: "Supprimer", text: "Le compte et son profil seront supprimés définitivement.", success: "Compte client supprimé." },
};
type Action = keyof typeof actions;

export function AdminClientAccounts({ accounts, total, page, query, now }: {
  accounts: AdminClientAccount[];
  total: number;
  page: number;
  query: string;
  now: number;
}) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState<{ id: string; action: Action } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);

  function pageUrl(number: number) {
    const params = new URLSearchParams({ tab: "clients" });
    if (query) params.set("q", query);
    if (number > 1) params.set("page", String(number));
    return "/admin?" + params;
  }

  async function submit(account: AdminClientAccount, action: Action) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/clients/${account.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Opération impossible.");
      setConfirmation(null);
      setNotice({ text: actions[action].success });
      if (action === "delete" && page > 1 && accounts.length === 1) {
        router.replace(pageUrl(page - 1));
      } else {
        router.refresh();
      }
    } catch (error) {
      setNotice({ error: true, text: error instanceof Error ? error.message : "Opération impossible." });
    } finally {
      setBusy(false);
    }
  }

  return <section aria-label="Comptes particuliers" className="grid gap-4">
    <form action="/admin" className="flex flex-wrap items-end gap-2 rounded-lg border border-sanispa-line bg-white p-4">
      <input type="hidden" name="tab" value="clients" />
      <label className="min-w-0 flex-1 text-sm font-bold">
        Rechercher par nom ou e-mail
        <input key={query} className="focus-ring mt-2 block w-full rounded-md border border-sanispa-line px-3 py-2 font-normal"
          type="search" name="q" maxLength={150} defaultValue={query} />
      </label>
      <button className={button} type="submit">Rechercher</button>
      {query ? <Link className={button} href={adminClientsPath}>Effacer</Link> : null}
    </form>
    <p className="font-bold">{total} {total === 1 ? "compte client" : "comptes clients"}</p>
    {notice ? <p role={notice.error ? "alert" : "status"} className={`rounded-md p-3 text-sm font-semibold ${notice.error ? "bg-red-50 text-red-800" : "bg-sanispa-ice"}`}>{notice.text}</p> : null}
    {accounts.length === 0 ? <p className="rounded-lg border border-sanispa-line bg-white p-4">
      {query ? "Aucun compte ne correspond à cette recherche." : "Aucun compte à afficher sur cette page."}
    </p> : null}
    {accounts.map(account => {
      const blocked = account.banned_until !== null && Date.parse(account.banned_until) > now;
      const access = blocked ? "Bloqué" : account.email_confirmed_at ? "Actif" : "E-mail à confirmer";
      const selected = confirmation?.id === account.id ? confirmation.action : null;
      const accessAction = blocked ? "unblock" : "block";
      return <article key={account.id} className="min-w-0 rounded-lg border border-sanispa-line bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="break-words font-bold">{account.name || account.email}</h2>
            {account.name ? <p className="break-all text-sm text-sanispa-steel">{account.email}</p> : null}
            {account.created_at ? <p className="mt-1 text-sm">Inscrit le <time dateTime={account.created_at}>{date.format(new Date(account.created_at))}</time></p> : null}
            <p className="mt-2 text-sm font-bold">{access}</p>
            {account.shared_access ? <p className="text-sm text-sanispa-steel">Accès administrateur ou partenaire associé à ce compte.</p>
              : account.has_history ? <p className="text-sm text-sanispa-steel">Ce compte est lié à des dossiers ou documents.</p> : null}
          </div>
          {!account.shared_access ? <div className="flex flex-wrap gap-2">
            <button className={button} type="button" aria-expanded={selected === accessAction} disabled={busy}
              onClick={() => { setNotice(null); setConfirmation({ id: account.id, action: accessAction }); }}>{actions[accessAction].label}</button>
            {!account.has_history ? <button className={`${button} border-red-200 text-red-800`} type="button"
              aria-expanded={selected === "delete"} disabled={busy}
              onClick={() => { setNotice(null); setConfirmation({ id: account.id, action: "delete" }); }}>Supprimer</button> : null}
          </div> : null}
        </div>
        {selected ? <div className="mt-3 rounded-md bg-sanispa-ice p-3 text-sm">
          <p className="font-bold">{actions[selected].label} ce compte client ?</p>
          <p>{actions[selected].text}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className={`${button} bg-sanispa-navy text-white`} type="button" disabled={busy}
              onClick={() => void submit(account, selected)}>{busy ? "En cours…" : "Confirmer"}</button>
            <button className={button} type="button" disabled={busy} onClick={() => setConfirmation(null)}>Annuler</button>
          </div>
        </div> : null}
      </article>;
    })}
    {page > 1 || total > 25 ? <nav aria-label="Pages des comptes clients" className="flex flex-wrap items-center gap-3">
      {page > 1 ? <Link className={button} href={pageUrl(page - 1)}>Précédente</Link> : null}
      <span className="text-sm">Page {page} sur {Math.max(1, Math.ceil(total / 25))}</span>
      {page * 25 < total ? <Link className={button} href={pageUrl(page + 1)}>Suivante</Link> : null}
    </nav> : null}
  </section>;
}
