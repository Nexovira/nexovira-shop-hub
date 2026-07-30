import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { applyReferralCode } from "@/lib/referral.functions";
import { toast } from "sonner";

const PENDING_KEY = "nexovira.ref.pending";

/**
 * Captures ?ref=CODE from the URL and attaches it to the account
 * as soon as the visitor is signed in.
 */
export function ReferralCapture() {
  const apply = useServerFn(applyReferralCode);

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("ref");
    if (code) localStorage.setItem(PENDING_KEY, code.toUpperCase());

    let cancelled = false;
    async function tryApply() {
      const pending = localStorage.getItem(PENDING_KEY);
      if (!pending) return;
      const { data } = await supabase.auth.getUser();
      if (!data.user || cancelled) return;
      try {
        const res = await apply({ data: { code: pending } });
        localStorage.removeItem(PENDING_KEY);
        if (res.applied) toast.success("Referral applied — welcome to NEXOVIRA!");
      } catch {
        localStorage.removeItem(PENDING_KEY);
      }
    }

    void tryApply();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") void tryApply();
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [apply]);

  return null;
}
