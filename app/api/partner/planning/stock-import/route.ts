import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/client-auth";
import { apiError, HttpError, readJson } from "@/lib/http";
import { requirePartnerPlanningOwner } from "@/lib/partner-auth";
import { maxStockCsvBytes, parsePartnerStockCsv } from "@/lib/partner-stock-csv";

const payloadSchema = z.object({ csv: z.string().max(maxStockCsvBytes), preview: z.boolean() }).strict();

export async function POST(request: Request) {
  try {
    const { partner, user, supabase } = await requirePartnerPlanningOwner(request);
    const { csv, preview } = payloadSchema.parse(await readJson(request, 4_000_000));
    if (Buffer.byteLength(csv) > maxStockCsvBytes) throw new HttpError(413, "Le fichier CSV est limité à 2 Mo.");
    await rateLimit(supabase, `partner-stock-import:${partner.id}`, 15);
    let parsed: ReturnType<typeof parsePartnerStockCsv>;
    try { parsed = parsePartnerStockCsv(csv); }
    catch (error) { throw new HttpError(400, error instanceof Error ? error.message : "Le fichier CSV est illisible."); }
    if (preview) {
      return NextResponse.json({ count: parsed.articles.length, sample: parsed.articles.slice(0, 5), errors: parsed.errors, invalid: parsed.invalid });
    }
    if (parsed.invalid) throw new HttpError(400, "Corrigez les lignes signalées avant d’importer le fichier.");
    const { data, error } = await supabase.rpc("import_partner_stock", {
      p_partner: partner.id, p_actor: user.id, p_rows: parsed.articles,
    });
    if (error?.message === "PARTNER_REQUIRED") throw new HttpError(403, "Vous n’avez plus accès à ce stock.");
    if (error) throw error;
    return NextResponse.json({ imported: data, skipped: parsed.articles.length - data });
  } catch (error) { return apiError(error); }
}
