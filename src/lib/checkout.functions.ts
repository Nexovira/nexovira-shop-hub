import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Finalise pricing for an order, apply store credit and start Paystack checkout. */
export const startPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string; useCredit: boolean; provider: "paystack" | "cash_on_delivery" }) => {
    if (!input?.orderId) throw new Error("orderId is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      recomputeOrderTotals,
      applyStoreCredit,
      paystackInitialize,
    } = await import("./checkout.server");

    const { order, subtotal, shipping, gross } = await recomputeOrderTotals(supabaseAdmin, data.orderId);
    if (order.user_id !== context.userId) throw new Error("Not your order");
    if (order.status !== "pending") throw new Error("This order has already been processed");

    const credit = await applyStoreCredit(
      supabaseAdmin,
      context.userId,
      order.id,
      gross,
      data.useCredit,
    );
    const total = Math.max(0, gross - credit);

    await supabaseAdmin
      .from("orders")
      .update({
        subtotal,
        shipping_fee: shipping,
        credit_applied: credit,
        total,
        payment_provider: data.provider,
      })
      .eq("id", order.id);

    if (data.provider === "cash_on_delivery") {
      return { mode: "cod" as const, total, credit };
    }

    const origin = new URL(getRequest().url).origin;
    const reference = `NX-${order.order_number}-${Date.now()}`;
    const init = await paystackInitialize({
      email: order.email,
      amount: Math.round(total * 100),
      reference,
      currency: "NGN",
      callback_url: `${origin}/payment/callback`,
      metadata: { order_id: order.id, order_number: order.order_number },
    });

    await supabaseAdmin
      .from("orders")
      .update({ paystack_reference: init.reference, paystack_status: "initialized" })
      .eq("id", order.id);

    return { mode: "paystack" as const, authorizationUrl: init.authorization_url, total, credit };
  });

/** Verify a Paystack transaction after the customer returns from checkout. */
export const verifyPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { reference: string }) => {
    if (!input?.reference) throw new Error("reference is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { paystackVerify, markOrderPaid } = await import("./checkout.server");

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, user_id, status")
      .eq("paystack_reference", data.reference)
      .maybeSingle();
    if (!order || order.user_id !== context.userId) throw new Error("Order not found");

    const tx = await paystackVerify(data.reference);
    if (tx.status !== "success") {
      await supabaseAdmin
        .from("orders")
        .update({ paystack_status: tx.status })
        .eq("id", order.id);
      return { paid: false, orderId: order.id, status: tx.status };
    }

    await markOrderPaid(supabaseAdmin, order.id, data.reference);
    return { paid: true, orderId: order.id, status: "success" };
  });
