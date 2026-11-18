import { NextResponse } from "next/server";
import { z } from "zod";
import { administrator, requireSameOrigin } from "@/lib/admin-auth";
import { apiError, readJson } from "@/lib/http";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase, user } = await administrator(request.headers);
    requireSameOrigin(request);
    const id = z
      .string()
      .uuid()
      .parse((await params).id);
    const body = z
      .object({
        partnerId: z.string().uuid().nullable(),
        completedAt: z.string().datetime(),
      })
      .strict()
      .parse(await readJson(request, 1000));
    const result = await supabase.rpc("record_intervention", {
      p_diagnostic: id,
      p_actor: user.id,
      p_partner: body.partnerId,
      p_at: body.completedAt,
    });
    if (result.error) throw result.error;
    return NextResponse.json({ saved: true });
  } catch (error) {
    return apiError(error);
  }
}
