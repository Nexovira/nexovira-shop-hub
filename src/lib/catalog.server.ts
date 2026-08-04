import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Publishable-key client for public, read-only catalog reads from the server. */
function publicClient() {
  return createClient<Database>(
    process.env["SUPABASE_URL"]!,
    process.env["SUPABASE_PUBLISHABLE_KEY"]!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

export type PublicProduct = {
  id: string;
  slug: string;
  title: string;
  brand: string | null;
  sku: string | null;
  description: string | null;
  short_description: string | null;
  price: number;
  discount_price: number | null;
  stock_quantity: number;
  track_inventory: boolean;
  specifications: Record<string, string | number | boolean | null> | null;
  categories: { name: string; slug: string } | null;
  product_images: {
    image_url: string;
    alt_text: string | null;
    is_primary: boolean;
    sort_order: number;
  }[];
};

const PRODUCT_SELECT =
  "id, slug, title, brand, sku, description, short_description, price, discount_price, stock_quantity, track_inventory, specifications, categories(name, slug), product_images(image_url, alt_text, is_primary, sort_order)";

/**
 * Resolves a product page by slug. When the slug is stale we return the current
 * slug so the route can issue a permanent redirect and keep shared links alive.
 */
export async function resolveProductBySlug(
  slug: string,
): Promise<{ product: PublicProduct | null; redirectTo: string | null }> {
  const supabase = publicClient();

  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw error;
  if (data) return { product: data as unknown as PublicProduct, redirectTo: null };

  const { data: redirect } = await supabase
    .from("product_slug_redirects")
    .select("product_id")
    .eq("old_slug", slug)
    .maybeSingle();
  if (!redirect) return { product: null, redirectTo: null };

  const { data: target } = await supabase
    .from("products")
    .select("slug")
    .eq("id", redirect.product_id)
    .eq("status", "published")
    .maybeSingle();

  return { product: null, redirectTo: target?.slug ?? null };
}
