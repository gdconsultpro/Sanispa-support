import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdmin();

    const { data: diagnostic, error: diagnosticError } = await supabase
      .from("diagnostics")
      .select("customer_id")
      .eq("id", id)
      .single();

    if (diagnosticError) throw diagnosticError;

    const { data: photos, error: photosError } = await supabase
      .from("diagnostic_photos")
      .select("storage_path")
      .eq("diagnostic_id", id);

    if (photosError) throw photosError;

    const paths = (photos ?? []).map((photo) => photo.storage_path).filter(Boolean);
    if (paths.length) {
      await supabase.storage.from("diagnostic-photos").remove(paths);
    }

    const { error: deleteDiagnosticError } = await supabase.from("diagnostics").delete().eq("id", id);
    if (deleteDiagnosticError) throw deleteDiagnosticError;

    if (diagnostic?.customer_id) {
      await supabase.from("customers").delete().eq("id", diagnostic.customer_id);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
