import { NextResponse } from "next/server";
import { adminDenied } from "@/lib/admin-auth";
export async function POST(request: Request) { const denied = adminDenied(request); if (denied)
    return denied; return NextResponse.json({ error: "Archivez le dossier pour conserver son historique et ses paiements." }, { status: 409 }); }
