"use client";
import { Archive, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
export function AdminActions({ diagnosticId, archived }: {
    diagnosticId: string;
    archived: boolean;
}) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    async function archive() {
        setLoading(true);
        const response = await fetch(`/api/admin/diagnostics/${diagnosticId}/archive`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ archived: !archived })
        });
        if (!response.ok) {
            setLoading(false);
            window.alert("Archivage impossible. Réessayez.");
            return;
        }
        router.refresh();
        setLoading(false);
    }
    return (<div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
      <button type="button" onClick={archive} disabled={loading} className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-sanispa-line bg-white px-3 py-2 text-sm font-bold text-sanispa-navy disabled:opacity-50">
        {archived ? <RotateCcw size={17} aria-hidden="true"/> : <Archive size={17} aria-hidden="true"/>}
        {archived ? "Désarchiver" : "Archiver"}
      </button>

    </div>);
}
