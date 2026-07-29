
CREATE TABLE public.shipping_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  state text NOT NULL,
  area text,
  fee numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.shipping_zones TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.shipping_zones TO authenticated;
GRANT ALL ON public.shipping_zones TO service_role;

ALTER TABLE public.shipping_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shipping zones public read active"
  ON public.shipping_zones FOR SELECT
  USING (is_active = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage shipping zones"
  ON public.shipping_zones FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER set_shipping_zones_updated_at
  BEFORE UPDATE ON public.shipping_zones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.orders
  ADD COLUMN shipping_zone_id uuid REFERENCES public.shipping_zones(id) ON DELETE SET NULL;

INSERT INTO public.shipping_zones (name, state, area, fee, sort_order) VALUES
  ('Lagos Mainland', 'Lagos', 'Mainland (Ikeja, Yaba, Surulere, etc.)', 3500, 10),
  ('Lagos Island', 'Lagos', 'Island (VI, Lekki Phase 1, Ikoyi)', 4500, 20),
  ('Lekki / Ajah', 'Lagos', 'Lekki Phase 2, Ajah, Sangotedo', 5500, 30),
  ('Abuja (FCT)', 'FCT', 'Within Abuja municipal', 6500, 40),
  ('Port Harcourt', 'Rivers', 'Port Harcourt metro', 7500, 50),
  ('Ibadan', 'Oyo', 'Ibadan metro', 6000, 60),
  ('Other South-West', 'South-West', 'Ogun, Osun, Ondo, Ekiti', 8500, 70),
  ('Other States (Nationwide)', 'Nationwide', 'Delivery to any other state', 12000, 100);
