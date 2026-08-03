-- 1. Payment tracking columns on orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS paystack_transaction_id text,
  ADD COLUMN IF NOT EXISTS amount_paid numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'NGN',
  ADD COLUMN IF NOT EXISTS stock_applied boolean NOT NULL DEFAULT false;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('unpaid','pending','paid','failed','abandoned','refunded'));

CREATE UNIQUE INDEX IF NOT EXISTS orders_paystack_reference_key
  ON public.orders (paystack_reference) WHERE paystack_reference IS NOT NULL;

-- 2. Payment event log (admin/service only)
CREATE TABLE IF NOT EXISTS public.payment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  user_id uuid,
  provider text NOT NULL DEFAULT 'paystack',
  event text NOT NULL,
  level text NOT NULL DEFAULT 'info',
  reference text,
  message text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.payment_logs TO service_role;
GRANT SELECT ON public.payment_logs TO authenticated;
ALTER TABLE public.payment_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read payment logs" ON public.payment_logs;
CREATE POLICY "Admins read payment logs" ON public.payment_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS payment_logs_order_idx ON public.payment_logs(order_id);
CREATE INDEX IF NOT EXISTS payment_logs_created_idx ON public.payment_logs(created_at DESC);

-- 3. Admin notifications (admin/service only)
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  title text NOT NULL,
  body text,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  email_status text NOT NULL DEFAULT 'skipped',
  email_error text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.admin_notifications TO service_role;
GRANT SELECT, UPDATE ON public.admin_notifications TO authenticated;
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read notifications" ON public.admin_notifications;
CREATE POLICY "Admins read notifications" ON public.admin_notifications
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "Admins update notifications" ON public.admin_notifications;
CREATE POLICY "Admins update notifications" ON public.admin_notifications
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE UNIQUE INDEX IF NOT EXISTS admin_notifications_order_type_key
  ON public.admin_notifications(order_id, type) WHERE order_id IS NOT NULL;

-- 4. Stock decrement, applied exactly once per order
CREATE OR REPLACE FUNCTION public.apply_order_stock(_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed boolean;
BEGIN
  UPDATE public.orders
     SET stock_applied = true
   WHERE id = _order_id AND stock_applied = false
  RETURNING true INTO claimed;

  IF claimed IS NOT TRUE THEN
    RETURN false;
  END IF;

  UPDATE public.products p
     SET stock_quantity = GREATEST(0, p.stock_quantity - oi.qty)
    FROM (
      SELECT product_id, SUM(quantity)::int AS qty
        FROM public.order_items
       WHERE order_id = _order_id AND product_id IS NOT NULL
       GROUP BY product_id
    ) oi
   WHERE p.id = oi.product_id AND p.track_inventory = true;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_order_stock(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_order_stock(uuid) TO service_role;

-- 5. Category image storage policies (private bucket, signed URLs)
DROP POLICY IF EXISTS "Admins read category images" ON storage.objects;
CREATE POLICY "Admins read category images" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'category-images' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins upload category images" ON storage.objects;
CREATE POLICY "Admins upload category images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'category-images' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins update category images" ON storage.objects;
CREATE POLICY "Admins update category images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'category-images' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'category-images' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins delete category images" ON storage.objects;
CREATE POLICY "Admins delete category images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'category-images' AND public.has_role(auth.uid(), 'admin'));