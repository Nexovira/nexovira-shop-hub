import { supabase } from "@/integrations/supabase/client";

export const PRODUCT_BUCKET = "product-images";
export const CATEGORY_BUCKET = "category-images";

const TEN_YEARS = 60 * 60 * 24 * 365 * 10;

async function uploadToBucket(bucket: string, file: File): Promise<{ path: string; url: string }> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  // Signed URL valid for ~10 years (private bucket)
  const { data, error: urlErr } = await supabase.storage.from(bucket).createSignedUrl(path, TEN_YEARS);
  if (urlErr || !data) throw urlErr ?? new Error("Failed to sign URL");
  return { path, url: data.signedUrl };
}

export function uploadProductImage(file: File) {
  return uploadToBucket(PRODUCT_BUCKET, file);
}

export function uploadCategoryImage(file: File) {
  return uploadToBucket(CATEGORY_BUCKET, file);
}

/** Recover the storage object path from a signed URL for a given bucket. */
export function storagePathFromSignedUrl(bucket: string, url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const rest = url.slice(idx + marker.length);
  const path = rest.split("?")[0];
  return path ? decodeURIComponent(path) : null;
}

/** Best-effort removal of a category image object; ignores already-missing files. */
export async function deleteCategoryImage(url: string | null | undefined) {
  const path = storagePathFromSignedUrl(CATEGORY_BUCKET, url);
  if (!path) return;
  await supabase.storage.from(CATEGORY_BUCKET).remove([path]);
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}
