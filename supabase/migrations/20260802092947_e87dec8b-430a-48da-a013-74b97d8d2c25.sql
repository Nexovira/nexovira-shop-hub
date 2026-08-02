-- 1) product_images: only images of published products are publicly readable
DROP POLICY IF EXISTS "Product images public read" ON public.product_images;

CREATE POLICY "Published product images are readable"
  ON public.product_images FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_images.product_id
        AND p.status = 'published'
    )
  );

-- Admins keep full access via existing "Admins manage product images" policy.

-- 2) storage.objects: remove blanket public read of the product-images bucket.
-- Storefront images are served through signed URLs, which bypass RLS.
DROP POLICY IF EXISTS "Product images public read" ON storage.objects;

CREATE POLICY "Admins read product images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'));

-- 3) has_role: restrict SECURITY DEFINER function to answering about the caller only
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND (
        auth.uid() = _user_id
        OR current_setting('role', true) = 'service_role'
      )
  );
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;