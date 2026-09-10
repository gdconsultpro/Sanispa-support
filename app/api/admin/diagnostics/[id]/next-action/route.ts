import { NextResponse } from "next/server";
import { z } from "zod";
import { administrator, requireSameOrigin } from "@/lib/admin-auth";
import { nextActionMutationSchema, type NextActionSnapshot } from "@/lib/admin-follow-up";
import { apiError, HttpError, readJson } from "@/lib/http";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, supabase } = await administrator(request.headers);
    requireSameOrigin(request);
    const id = z.string().uuid().parse((await params).id);
    const mutation = nextActionMutationSchema.parse(await readJson(request, 10000));
    const { data, error } = await supabase.rpc("update_admin_next_action", {
      p_id: id,
      p_operation: mutation.operation,
      p_text: mutation.operation === "save" ? mutation.text : null,
      p_due_at: mutation.operation === "save" ? mutation.dueAt : null,
      p_expected_version: mutation.expectedVersion,
      p_actor: user.id,
    });
    if (error) {
      if (error.message === "NEXT_ACTION_CONFLICT")
        throw new HttpError(409, "Cette action a été modifiée dans un autre onglet. Rechargez le dossier avant de réessayer.");
      if (error.message === "NEXT_ACTION_STATE")
        throw new HttpError(409, "Cette action n’est plus en attente. Rechargez le dossier pour consulter son état.");
      if (error.message === "NOT_FOUND")
        throw new HttpError(404, "Dossier introuvable.");
      if (error.message === "NEXT_ACTION_INVALID")
        throw new HttpError(400, "Renseignez une action de 1 à 1 000 caractères et une échéance valide.");
      throw error;
    }
    if (!data) throw new HttpError(503, "La confirmation de l’enregistrement n’a pas été reçue. Rechargez le dossier avant de réessayer.");
    return NextResponse.json({ action: data as NextActionSnapshot }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
