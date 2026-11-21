import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/client-auth";
import { diagnosticPdf } from "@/lib/diagnostic-pdf";
import { apiError } from "@/lib/http";
export async function GET(request: Request, { params }: {
    params: Promise<{
        id: string;
    }>;
}) { try {
    const { user } = await requireUser(request);
    const { id } = await params;
    z.string().uuid().parse(id);
    return new NextResponse(await diagnosticPdf(id, user.id), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="sanispa-dossier.pdf"', "Cache-Control": "private, no-store" } });
}
catch (e) {
    return apiError(e);
} }
