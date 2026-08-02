CREATE TABLE public.payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'paystack',
  event_id TEXT NOT NULL,
  event_type TEXT,
  reference TEXT,
  order_id UUID,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

CREATE INDEX payment_webhook_events_reference_idx ON public.payment_webhook_events(reference);

GRANT ALL ON public.payment_webhook_events TO service_role;

ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated: this log is service-role only.