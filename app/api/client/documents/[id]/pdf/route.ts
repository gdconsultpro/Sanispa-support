import { NextResponse } from "next/server";
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
    return new NextResponse(await diagnosticPdf(id, user.id), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="sanispa-dossier.pdf"' } });
}
catch (e) {
    return apiError(e);
} }
