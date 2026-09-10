import { NextResponse } from "next/server";
export class HttpError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
export async function readBytes(request: Request, maxBytes: number) {
    if (Number(request.headers.get("content-length")) > maxBytes)
        throw new HttpError(413, "Le fichier est trop volumineux.");
    const reader = request.body?.getReader();
    if (!reader)
        throw new HttpError(400, "Requête vide.");
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        size += value.byteLength;
        if (size > maxBytes) {
            await reader.cancel();
            throw new HttpError(413, "Le fichier est trop volumineux.");
        }
        chunks.push(value);
    }
    return Buffer.concat(chunks);
}
export async function readJson(request: Request, maxBytes = 2400000) {
    const bytes = await readBytes(request, maxBytes);
    try {
        return JSON.parse(bytes.toString("utf8"));
    }
    catch {
        throw new HttpError(400, "Requête invalide.");
    }
}
export function apiError(error: unknown) {
    if (error instanceof HttpError)
        return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.name === "ZodError")
        return NextResponse.json({ error: "Vérifiez les informations saisies." }, { status: 400 });
    console.error("Échec opération SANISPA", error instanceof Error ? error.name : "database");
    return NextResponse.json({ error: "Opération impossible pour le moment. Votre saisie est conservée ; réessayez." }, { status: 503 });
}
