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
  // Idempotency: if this order already consumed credit (retry / double submit),
  // reuse that amount instead of deducting the balance again.
  const { data: existing } = await admin
    .from("credit_transactions")
    .select("amount")
    .eq("order_id", orderId)
    .eq("user_id", userId)
    .lt("amount", 0)
    .maybeSingle();
  const alreadyApplied = existing ? Math.abs(Number(existing.amount)) : 0;
  if (alreadyApplied > 0) return Math.min(alreadyApplied, Math.max(0, gross - 100));
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

/** Append a payment event to the audit log. Never throws. */
export async function logPayment(
  admin: AnyClient,
  entry: {
    orderId?: string | null;
    userId?: string | null;
    event: string;
    level?: "info" | "warn" | "error";
    reference?: string | null;
    message?: string | null;
    context?: Record<string, unknown>;
  },
) {
  const level = entry.level ?? "info";
  const line = `[payment:${entry.event}] ${entry.message ?? ""} ref=${entry.reference ?? "-"} order=${entry.orderId ?? "-"}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
  try {
    await admin.from("payment_logs").insert({
      order_id: entry.orderId ?? null,
      user_id: entry.userId ?? null,
      provider: "paystack",
      event: entry.event,
      level,
      reference: entry.reference ?? null,
      message: entry.message ?? null,
      context: entry.context ?? {},
    });
  } catch (e) {
    console.error("[payment] could not persist log", (e as Error).message);
  }
}

export function siteBaseUrl(hint?: string | null) {
  return (hint || process.env.SITE_URL || "https://nexovira-shop-hub.lovable.app").replace(/\/$/, "");
}

/** Email + record an admin notification for a freshly paid order. Never throws. */
export async function notifyAdminOfPaidOrder(admin: AnyClient, orderId: string, baseUrl?: string | null) {
  try {
    const { renderAdminOrderEmail, sendEmail, adminEmailRecipient } = await import("./email.server");

    const { data: order } = await admin
      .from("orders")
      .select(
        "id, order_number, full_name, email, phone, address_line1, address_line2, city, state, subtotal, shipping_fee, credit_applied, total, amount_paid, payment_status, payment_provider, paystack_reference, paystack_transaction_id, created_at",
      )
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return;

    const { data: items } = await admin
      .from("order_items")
      .select("title, quantity, unit_price, image_url")
      .eq("order_id", orderId);

    const adminUrl = `${siteBaseUrl(baseUrl)}/admin/orders/${order.id}`;
    const html = renderAdminOrderEmail({
      orderId: order.id,
      orderNumber: order.order_number,
      customerName: order.full_name ?? "—",
      customerEmail: order.email ?? "—",
      customerPhone: order.phone ?? "—",
      address: [order.address_line1, order.address_line2, order.city, order.state]
        .filter(Boolean)
        .join(", "),
      items: (items ?? []).map((i: any) => ({
        title: i.title,
        quantity: Number(i.quantity),
        unit_price: Number(i.unit_price),
        image_url: i.image_url ?? null,
      })),
      subtotal: Number(order.subtotal ?? 0),
      shipping: Number(order.shipping_fee ?? 0),
      creditApplied: Number(order.credit_applied ?? 0),
      total: Number(order.total ?? 0),
      amountPaid: Number(order.amount_paid ?? 0),
      paymentStatus: order.payment_status ?? "paid",
      paymentMethod: order.payment_provider === "cash_on_delivery" ? "Cash on delivery" : "Paystack",
      reference: order.paystack_reference ?? "—",
      transactionId: order.paystack_transaction_id ?? "—",
      orderDate: new Date(order.created_at as string).toLocaleString("en-NG", { timeZone: "Africa/Lagos" }),
      adminUrl,
    });

    const result = await sendEmail({
      to: adminEmailRecipient(),
      subject: `New paid order ${order.order_number} — ${order.full_name ?? "Customer"}`,
      html,
    });

    await admin.from("admin_notifications").insert({
      type: "order_paid",
      title: `Payment received for order ${order.order_number}`,
      body: `${order.full_name ?? "Customer"} paid ${Number(order.amount_paid ?? order.total ?? 0)} NGN.`,
      order_id: order.id,
      email_status: result.status,
      email_error: result.error ?? null,
    });

    await logPayment(admin, {
      orderId: order.id,
      event: "admin_notified",
      level: result.status === "failed" ? "warn" : "info",
      reference: order.paystack_reference,
      message: `Admin email ${result.status}`,
      context: { error: result.error ?? null },
    });
  } catch (e) {
    console.error("[payment] admin notification failed", (e as Error).message);
  }
}

/** Mark an order paid exactly once, apply stock, notify admin and settle referrals. */
export async function markOrderPaid(
  admin: AnyClient,
  orderId: string,
  reference: string,
  tx?: { transactionId?: string | number | null; amountKobo?: number | null; paidAt?: string | null; channel?: string | null },
  baseUrl?: string | null,
) {
  // Conditional update: only a still-pending order transitions to paid. Concurrent
  // webhook retries lose the race and affect zero rows, so the referral reward and
  // any downstream side effects run exactly once.
  const patch: Record<string, unknown> = {
    status: "paid",
    payment_status: "paid",
    paystack_status: "success",
    paystack_reference: reference,
    paid_at: tx?.paidAt ?? new Date().toISOString(),
  };
  if (tx?.transactionId != null) patch.paystack_transaction_id = String(tx.transactionId);
  if (tx?.amountKobo != null) patch.amount_paid = Number(tx.amountKobo) / 100;

  const { data: updated, error } = await admin
    .from("orders")
    .update(patch)
    .eq("id", orderId)
    .eq("status", "pending")
    .select("id, user_id, total, amount_paid");

  if (error) {
    await logPayment(admin, {
      orderId,
      event: "mark_paid_failed",
      level: "error",
      reference,
      message: error.message,
    });
    throw new Error(error.message);
  }

  const row = updated?.[0];
  if (!row) {
    await logPayment(admin, {
      orderId,
      event: "mark_paid_duplicate",
      reference,
      message: "Order was not pending; ignoring duplicate confirmation",
    });
    return { alreadyProcessed: true };
  }

  // Backfill amount_paid when Paystack did not give us an amount (e.g. fully
  // credit-covered orders) so invoices always show what was actually settled.
  if (tx?.amountKobo == null) {
    await admin.from("orders").update({ amount_paid: Number(row.total ?? 0) }).eq("id", orderId);
  }

  const { error: stockError } = await admin.rpc("apply_order_stock", { _order_id: orderId });
  await logPayment(admin, {
    orderId,
    userId: row.user_id,
    event: stockError ? "stock_update_failed" : "stock_updated",
    level: stockError ? "error" : "info",
    reference,
    message: stockError?.message ?? "Inventory decremented",
  });

  if (row.user_id) await settleReferralReward(admin, row.user_id, orderId);

  await logPayment(admin, {
    orderId,
    userId: row.user_id,
    event: "order_paid",
    reference,
    message: "Order marked paid",
    context: { transactionId: tx?.transactionId ?? null, channel: tx?.channel ?? null },
  });

  await notifyAdminOfPaidOrder(admin, orderId, baseUrl);

  return { alreadyProcessed: false };
}

