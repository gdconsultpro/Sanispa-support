import { getSupabaseAdmin } from "./supabase";
import type { FieldPhoto } from "./partner-field";

export const fieldPhotoBucket = "partner-field-photos";
export function fieldPhotoPath(partner: string, session: string, photo: string) {
  return [partner, session, photo + ".jpg"].join("/");
}

export async function loadFieldPhotos(supabase: ReturnType<typeof getSupabaseAdmin>, partner: string, session: string): Promise<FieldPhoto[]> {
  const { data, error } = await supabase.from("partner_field_photos").select("id").eq("session_id", session).order("created_at").order("id");
  if (error) throw error;
  if (!data.length) return [];
  const paths = data.map(photo => fieldPhotoPath(partner, session, photo.id));
  const signed = await supabase.storage.from(fieldPhotoBucket).createSignedUrls(paths, 300);
  if (signed.error) throw signed.error;
  const byPath = new Map(signed.data.map(photo => [photo.path, photo.signedUrl]));
  return data.flatMap(({ id }, index) => {
    const url = byPath.get(paths[index]);
    return url ? [{ id, url }] : [];
  });
}
