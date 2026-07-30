import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Link the signed-in user to whoever referred them (first time only). */
export const applyReferralCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string }) => {
    const code = String(input?.code ?? "").trim().toUpperCase();
    if (!/^NX[A-Z0-9]{4,12}$/.test(code)) throw new Error("Invalid referral code");
    return { code };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("id, referred_by, referral_code, created_at")
      .eq("id", context.userId)
      .maybeSingle();
    if (!me) throw new Error("Profile not found");
    if (me.referred_by) return { applied: false, reason: "already_referred" as const };
    if (me.referral_code === data.code) return { applied: false, reason: "self" as const };

    const { data: referrer } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("referral_code", data.code)
      .maybeSingle();
    if (!referrer) return { applied: false, reason: "unknown_code" as const };

    // Only allow before the user has any order.
    const { count } = await supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId);
    if ((count ?? 0) > 0) return { applied: false, reason: "too_late" as const };

    await supabaseAdmin.from("profiles").update({ referred_by: referrer.id }).eq("id", context.userId);
    await supabaseAdmin
      .from("referrals")
      .upsert(
        { referrer_id: referrer.id, referee_id: context.userId, status: "pending" },
        { onConflict: "referee_id" },
      );

    return { applied: true, reason: "ok" as const };
  });
