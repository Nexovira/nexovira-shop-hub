import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Finalise pricing for an order, apply store credit and start Paystack checkout. */
export const startPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string; useCredit: boolean; provider: "paystack" | "cash_on_delivery" }) => {
    if (!input?.orderId) throw new Error("orderId is required");
    if (input.provider !== "paystack" && input.provider !== "cash_on_delivery") {
      throw new Error("Unsupported payment provider");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      recomputeOrderTotals,
      applyStoreCredit,
      paystackInitialize,
      logPayment,
      notifyAdminOfPaidOrder,
      siteBaseUrl,
    } = await import("./checkout.server");

    const { order, subtotal, shipping, gross } = await recomputeOrderTotals(supabaseAdmin, data.orderId);

    // Ownership check — an order that is not yours is invisible, not "forbidden".
    if (order.user_id !== context.userId) {
      await logPayment(supabaseAdmin, {
        orderId: data.orderId,
        userId: context.userId,
        event: "ownership_violation",
        level: "warn",
        message: "User attempted to pay for an order they do not own",
      });
      throw new Error("Order not found");
    }
    if (order.status !== "pending") throw new Error("This order has already been processed");

    const credit = await applyStoreCredit(supabaseAdmin, context.userId, order.id, gross, data.useCredit);
    const total = Math.max(0, gross - credit);

    await supabaseAdmin
      .from("orders")
      .update({
        subtotal,
        shipping_fee: shipping,
        credit_applied: credit,
        total,
        payment_provider: data.provider,
        payment_status: data.provider === "paystack" ? "pending" : "unpaid",
      })
      .eq("id", order.id);

    const origin = (() => {
      try {
        return new URL(getRequest().url).origin;
      } catch {
        return null;
      }
    })();
    const baseUrl = siteBaseUrl(origin);

    if (data.provider === "cash_on_delivery") {
      await logPayment(supabaseAdmin, {
        orderId: order.id,
        userId: context.userId,
        event: "cod_selected",
        message: `Cash on delivery order for ${total}`,
      });
      return { mode: "cod" as const, total, credit };
    }

    // Store credit covered the whole order — nothing to charge.
    if (total <= 0) {
      const { markOrderPaid } = await import("./checkout.server");
      await markOrderPaid(supabaseAdmin, order.id, `CREDIT-${order.order_number}`, {
        amountKobo: 0,
        channel: "store_credit",
      }, baseUrl);
      return { mode: "credit" as const, total: 0, credit };
    }

    const reference = `NX-${order.order_number}-${Date.now()}`;
    try {
      const init = await paystackInitialize({
        email: order.email,
        amount: Math.round(total * 100),
        reference,
        currency: "NGN",
        callback_url: `${baseUrl}/payment/callback`,
        metadata: { order_id: order.id, order_number: order.order_number, user_id: context.userId },
      });

      await supabaseAdmin
        .from("orders")
        .update({ paystack_reference: init.reference, paystack_status: "initialized" })
        .eq("id", order.id);

      await logPayment(supabaseAdmin, {
        orderId: order.id,
        userId: context.userId,
        event: "initialized",
        reference: init.reference,
        message: `Paystack checkout started for ${total} NGN`,
        context: { callback_url: `${baseUrl}/payment/callback` },
      });

      return { mode: "paystack" as const, authorizationUrl: init.authorization_url, total, credit };
    } catch (e) {
      await logPayment(supabaseAdmin, {
        orderId: order.id,
        userId: context.userId,
        event: "initialize_failed",
        level: "error",
        reference,
        message: (e as Error).message,
      });
      // Silence the unused import warning path: admin is only notified on success.
      void notifyAdminOfPaidOrder;
      throw new Error(`Could not start payment: ${(e as Error).message}`);
    }
  });

/** Verify a Paystack transaction after the customer returns from checkout. */
export const verifyPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { reference: string }) => {
    if (!input?.reference || typeof input.reference !== "string" || input.reference.length > 200) {
      throw new Error("reference is required");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { paystackVerify, markOrderPaid, logPayment, siteBaseUrl } = await import("./checkout.server");

    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("id, user_id, status, total")
      .eq("paystack_reference", data.reference)
      .maybeSingle();

    // IDOR guard: never reveal that a reference belongs to somebody else.
    if (!order || order.user_id !== context.userId) {
      await logPayment(supabaseAdmin, {
        userId: context.userId,
        event: "verify_denied",
        level: "warn",
        reference: data.reference,
        message: "Reference not found for this user",
      });
      throw new Error("Order not found");
    }

    const tx = await paystackVerify(data.reference);
    await logPayment(supabaseAdmin, {
      orderId: order.id,
      userId: context.userId,
      event: "verify",
      reference: data.reference,
      message: `Paystack reported ${tx.status}`,
      context: { amount: tx.amount, transactionId: tx.id ?? null },
    });

    if (tx.status !== "success") {
      await supabaseAdmin
        .from("orders")
        .update({
          paystack_status: tx.status,
          payment_status: tx.status === "abandoned" ? "abandoned" : "failed",
        })
        .eq("id", order.id);
      return { paid: false, orderId: order.id, status: tx.status };
    }

    // Amount sanity check — the charge must cover the server-side total.
    const expectedKobo = Math.round(Number(order.total ?? 0) * 100);
    if (Number(tx.amount) + 1 < expectedKobo) {
      await logPayment(supabaseAdmin, {
        orderId: order.id,
        userId: context.userId,
        event: "amount_mismatch",
        level: "error",
        reference: data.reference,
        message: `Paid ${tx.amount} kobo but order requires ${expectedKobo}`,
      });
      await supabaseAdmin.from("orders").update({ payment_status: "failed" }).eq("id", order.id);
      return { paid: false, orderId: order.id, status: "underpaid" };
    }

    const origin = (() => {
      try {
        return new URL(getRequest().url).origin;
      } catch {
        return null;
      }
    })();

    await markOrderPaid(
      supabaseAdmin,
      order.id,
      data.reference,
      {
        transactionId: tx.id ?? null,
        amountKobo: Number(tx.amount),
        paidAt: tx.paid_at ?? null,
        channel: tx.channel ?? null,
      },
      siteBaseUrl(origin),
    );

    return { paid: true, orderId: order.id, status: "success" };
  });
