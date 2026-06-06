"use client";

import { Archive, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminActions({ diagnosticId, archived }: { diagnosticId: string; archived: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function archive() {
    setLoading(true);
    await fetch(`/api/admin/diagnostics/${diagnosticId}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: !archived })
    });
    router.refresh();
    setLoading(false);
  }

  async function remove() {
    const confirmed = window.confirm("Supprimer définitivement cette demande et ses photos ?");
    if (!confirmed) return;

    setLoading(true);
    await fetch(`/api/admin/diagnostics/${diagnosticId}/delete`, {
      method: "POST"
    });
    router.refresh();
    setLoading(false);
  }

  return (
    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={archive}
        disabled={loading}
        className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-sanispa-line bg-white px-3 py-2 text-sm font-bold text-sanispa-navy disabled:opacity-50"
      >
        {archived ? <RotateCcw size={17} aria-hidden="true" /> : <Archive size={17} aria-hidden="true" />}
        {archived ? "Désarchiver" : "Archiver"}
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={loading}
        className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 disabled:opacity-50"
      >
        <Trash2 size={17} aria-hidden="true" />
        Supprimer
      </button>
    </div>
  );
}
