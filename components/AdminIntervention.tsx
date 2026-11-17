"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./Button";
export function AdminIntervention({
  diagnosticId,
  partnerId,
  partnerName,
}: {
  diagnosticId: string;
  partnerId: string | null;
  partnerName?: string;
}) {
  const router = useRouter();
  const [who, setWho] = useState(""),
    [date, setDate] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/admin/diagnostics/${diagnosticId}/intervention`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            partnerId: who === "sanispa" ? null : partnerId,
            completedAt: new Date(date).toISOString(),
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setMessage(
        "Intervention confirmée : le nom de l’entreprise et la date sont visibles par le client.",
      );
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-xl border border-sanispa-line p-4">
      <h3 className="font-bold">Intervention réellement effectuée</h3>
      <p className="mt-2 text-sm">
        À renseigner uniquement après intervention. L’attribution d’un dossier
        ne signifie pas qu’un partenaire est déjà intervenu.
      </p>
      <form className="mt-4 grid gap-3" onSubmit={save}>
        <label className="grid gap-2 text-sm font-bold">
          Entreprise intervenante
          <select
            required
            value={who}
            onChange={(e) => setWho(e.target.value)}
            className="focus-ring min-h-12 rounded-md border p-2"
          >
            <option value="">Sélectionner</option>
            <option value="sanispa">SANISPA</option>
            {partnerId ? (
              <option value="partner">
                {partnerName || "Partenaire attribué"}
              </option>
            ) : null}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-bold">
          Date de l’intervention
          <input
            required
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="focus-ring rounded-md border p-3"
          />
        </label>
        <Button disabled={busy} type="submit">
          Confirmer l’intervention effectuée
        </Button>
      </form>
      {message ? (
        <p role="status" className="mt-3 text-sm">
          {message}
        </p>
      ) : null}
    </section>
  );
}
