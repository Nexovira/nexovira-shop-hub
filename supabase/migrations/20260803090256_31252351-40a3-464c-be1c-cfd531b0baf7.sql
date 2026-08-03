-- 1. Profiles: add a WITH CHECK so an update can never re-point a row at another user.
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 2. Protect money/identity columns from client-side edits. Only privileged
--    server code (service_role) may change the wallet balance or referral code.
CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('role', true) = 'service_role'
     OR auth.role() = 'service_role'
     OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.id := OLD.id;
  NEW.credit_balance := OLD.credit_balance;
  NEW.referral_code := OLD.referral_code;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_profile_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_profile_columns_trg ON public.profiles;
CREATE TRIGGER protect_profile_columns_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_columns();

-- 3. Webhook event log had RLS enabled but no policies; let admins read it.
GRANT SELECT ON public.payment_webhook_events TO authenticated;
CREATE POLICY "Admins read webhook events"
ON public.payment_webhook_events FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));