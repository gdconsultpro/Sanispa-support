import { adminDenied } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import { diagnosticPdf } from "@/lib/diagnostic-pdf";
import { apiError } from "@/lib/http";
export async function GET(request: Request, { params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    const denied = await adminDenied(request);
    if (denied)
        return denied;
    try {
        const { id } = await params;
        return new NextResponse(await diagnosticPdf(id), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="sanispa-dossier.pdf"' } });
    }
    catch (e) {
        return apiError(e);
    }
}
