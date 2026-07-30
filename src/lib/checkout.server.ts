/**
 * Server-only helpers for order pricing, store credit and Paystack.
 * Never import this from a component.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const REFERRAL_REWARD = 2000;

type AnyClient = SupabaseClient<any, any, any>;

/** Recompute an order's true totals from the database (never trust the client). */
export async function recomputeOrderTotals(admin: AnyClient, orderId: string) {
  const { data: order, error } = await admin
    .from("orders")
    .select("id, user_id, email, order_number, shipping_zone_id, status, credit_applied")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!order) throw new Error("Order not found");

  const { data: items, error: itemsErr } = await admin
    .from("order_items")
    .select("product_id, quantity, unit_price")
    .eq("order_id", orderId);
  if (itemsErr) throw new Error(itemsErr.message);
  if (!items || items.length === 0) throw new Error("Order has no items");

  const ids = items.map((i: any) => i.product_id).filter(Boolean);
  const { data: products } = await admin
    .from("products")
    .select("id, price, discount_price, status")
    .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

  const priceOf = (productId: string | null, fallback: number) => {
    const p = products?.find((x: any) => x.id === productId);
    if (!p || p.status !== "published") return fallback;
    return Number(p.discount_price ?? p.price);
  };

  const subtotal = items.reduce(
    (sum: number, i: any) => sum + priceOf(i.product_id, Number(i.unit_price)) * Number(i.quantity),
    0,
  );

  let shipping = 0;
  if (order.shipping_zone_id) {
    const { data: zone } = await admin
      .from("shipping_zones")
      .select("fee")
      .eq("id", order.shipping_zone_id)
      .maybeSingle();
    shipping = Number(zone?.fee ?? 0);
  }

  return { order, subtotal, shipping, gross: subtotal + shipping };
}

/** Move store credit onto an order. Returns the credit actually applied. */
export async function applyStoreCredit(
  admin: AnyClient,
  userId: string,
  orderId: string,
  gross: number,
  requested: boolean,
) {
  if (!requested) return 0;
  const { data: profile } = await admin
    .from("profiles")
    .select("credit_balance")
    .eq("id", userId)
    .maybeSingle();
  const balance = Number(profile?.credit_balance ?? 0);
  // Paystack needs a payable remainder of at least ₦100.
  const credit = Math.max(0, Math.min(balance, Math.max(0, gross - 100)));
  if (credit <= 0) return 0;

  await admin.from("profiles").update({ credit_balance: balance - credit }).eq("id", userId);
  await admin.from("credit_transactions").insert({
    user_id: userId,
    amount: -credit,
    reason: "Applied to order",
    order_id: orderId,
  });
  return credit;
}

/** Credit the referrer once their invitee's first order is paid. */
export async function settleReferralReward(admin: AnyClient, buyerId: string, orderId: string) {
  const { data: referral } = await admin
    .from("referrals")
    .select("id, referrer_id, reward_amount, status")
    .eq("referee_id", buyerId)
    .maybeSingle();
  if (!referral || referral.status !== "pending") return;

  const reward = Number(referral.reward_amount ?? REFERRAL_REWARD);
  const { data: profile } = await admin
    .from("profiles")
    .select("credit_balance")
    .eq("id", referral.referrer_id)
    .maybeSingle();

  await admin
    .from("profiles")
    .update({ credit_balance: Number(profile?.credit_balance ?? 0) + reward })
    .eq("id", referral.referrer_id);
  await admin.from("credit_transactions").insert({
    user_id: referral.referrer_id,
    amount: reward,
    reason: "Referral reward",
    order_id: orderId,
  });
  await admin
    .from("referrals")
    .update({ status: "credited", order_id: orderId })
    .eq("id", referral.id);
}

export function paystackKey() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("Paystack is not configured yet.");
  return key;
}

export async function paystackInitialize(payload: Record<string, unknown>) {
  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${paystackKey()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = (await res.json()) as any;
  if (!res.ok || !json?.status) throw new Error(json?.message || "Paystack initialization failed");
  return json.data as { authorization_url: string; reference: string };
}

export async function paystackVerify(reference: string) {
  const res = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${paystackKey()}` } },
  );
  const json = (await res.json()) as any;
  if (!res.ok || !json?.status) throw new Error(json?.message || "Could not verify payment");
  return json.data as { status: string; reference: string; amount: number; metadata?: any };
}

/** Mark an order paid exactly once and settle any referral reward. */
export async function markOrderPaid(admin: AnyClient, orderId: string, reference: string) {
  const { data: order } = await admin
    .from("orders")
    .select("id, user_id, status")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return;
  if (order.status === "paid" || order.status === "processing" || order.status === "shipped" || order.status === "delivered") return;

  await admin
    .from("orders")
    .update({ status: "paid", paystack_status: "success", paystack_reference: reference })
    .eq("id", orderId);

  if (order.user_id) await settleReferralReward(admin, order.user_id, orderId);
}
