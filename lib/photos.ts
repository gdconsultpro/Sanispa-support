import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "./supabase";
export function decodePhoto(value: string) {
    const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match)
        throw new Error("Utilisez une photo JPG, PNG ou WebP.");
    const buffer = Buffer.from(match[2], "base64");
    if (buffer.length > 330000 || buffer.length < 12)
        throw new Error("Photo invalide ou trop volumineuse.");
    const valid = match[1] === "image/jpeg" ? buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255 : match[1] === "image/png" ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) : buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
    if (!valid)
        throw new Error("Le contenu de cette photo est invalide.");
    return { buffer, contentType: match[1], hash: createHash("sha256").update(buffer).digest("hex") };
}
export async function signPhotos<T extends {
    storage_path: string;
    public_url?: string | null;
}>(supabase: ReturnType<typeof getSupabaseAdmin>, photos: T[]) {
    return Promise.all(photos.map(async (photo) => { const { data, error } = await supabase.storage.from("diagnostic-photos").createSignedUrl(photo.storage_path, 900); if (error)
        throw error; return { ...photo, public_url: data.signedUrl }; }));
}
