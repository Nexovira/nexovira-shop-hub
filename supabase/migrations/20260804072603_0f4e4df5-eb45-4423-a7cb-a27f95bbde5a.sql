ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand text;

CREATE INDEX IF NOT EXISTS products_brand_idx ON public.products (brand);

CREATE TABLE IF NOT EXISTS public.product_slug_redirects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  old_slug text NOT NULL UNIQUE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.product_slug_redirects TO anon;
GRANT SELECT ON public.product_slug_redirects TO authenticated;
GRANT ALL ON public.product_slug_redirects TO service_role;

ALTER TABLE public.product_slug_redirects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Slug redirects are publicly readable"
  ON public.product_slug_redirects FOR SELECT
  USING (true);

CREATE POLICY "Admins manage slug redirects"
  ON public.product_slug_redirects FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));