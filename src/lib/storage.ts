import { supabase } from "@/integrations/supabase/client";

export const PRODUCT_BUCKET = "product-images";

export async function uploadProductImage(file: File): Promise<{ path: string; url: string }> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(PRODUCT_BUCKET).upload(path, file, {
    cacheControl: "3600", upsert: false,
  });
  if (error) throw error;
  // Signed URL valid for ~10 years (private bucket)
  const { data, error: urlErr } = await supabase.storage
    .from(PRODUCT_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (urlErr || !data) throw urlErr ?? new Error("Failed to sign URL");
  return { path, url: data.signedUrl };
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}
