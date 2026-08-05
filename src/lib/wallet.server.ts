/**
 * Server-only helpers for the admin wallet: revenue ledger, Paystack balance
 * and bank payouts. Never import this from a component.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type AnyClient = SupabaseClient<any, any, any>;

const PAYSTACK_BASE = "https://api.paystack.co";

function paystackKey() {
  const key = process.env["PAYSTACK_SECRET_KEY"];
  if (!key) throw new Error("Paystack is not configured yet.");
  return key;
}

export async function paystack<T = any>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${paystackKey()}`,
      "Content-Type": "application/json",
    },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Paystack request failed [${res.status}]: ${text.slice(0, 300)}`);
  }
  if (!res.ok || json?.status === false) {
    throw new Error(json?.message || `Paystack request failed [${res.status}]`);
  }
  return json as T;
}

/** Requires the caller to hold the admin role; throws otherwise. */
export async function assertAdmin(supabase: AnyClient, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export type WalletLedgerEntry = {
  id: string;
  kind: "sale" | "payout";
  label: string;
  reference: string | null;
  amount: number;
  status: string;
  created_at: string;
};

/** Builds the wallet summary from verified paid orders minus recorded payouts. */
export async function buildWallet(admin: AnyClient) {
  const { data: orders, error } = await admin
    .from("orders")
    .select("id, order_number, amount_paid, total, paid_at, created_at, paystack_reference, payment_provider, payment_status")
    .eq("payment_status", "paid")
    .order("paid_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  const { data: payouts, error: payoutErr } = await admin
    .from("payouts")
    .select("id, amount, status, reference, bank_name, account_number, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (payoutErr) throw new Error(payoutErr.message);

  const grossRevenue = (orders ?? []).reduce(
    (sum: number, o: any) => sum + Number(o.amount_paid || o.total || 0),
    0,
  );
  const reservedPayouts = (payouts ?? [])
    .filter((p: any) => p.status !== "failed" && p.status !== "reversed")
    .reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);

  const entries: WalletLedgerEntry[] = [
    ...(orders ?? []).map((o: any) => ({
      id: o.id,
      kind: "sale" as const,
      label: `Order ${o.order_number}`,
      reference: o.paystack_reference ?? null,
      amount: Number(o.amount_paid || o.total || 0),
      status: o.payment_provider === "cash_on_delivery" ? "cash on delivery" : "paid",
      created_at: o.paid_at ?? o.created_at,
    })),
    ...(payouts ?? []).map((p: any) => ({
      id: p.id,
      kind: "payout" as const,
      label: `Payout to ${p.bank_name ?? "bank"} ••${String(p.account_number ?? "").slice(-4)}`,
      reference: p.reference ?? null,
      amount: -Number(p.amount || 0),
      status: p.status,
      created_at: p.created_at,
    })),
  ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return {
    grossRevenue,
    paidOrders: orders?.length ?? 0,
    totalPaidOut: reservedPayouts,
    availableBalance: Math.max(0, grossRevenue - reservedPayouts),
    entries: entries.slice(0, 100),
  };
}

/** Live Paystack settlement balance, in Naira. Returns null when unavailable. */
export async function paystackBalance() {
  try {
    const json = await paystack<{ data: { currency: string; balance: number }[] }>("/balance");
    return (json.data ?? []).map((b) => ({ currency: b.currency, amount: Number(b.balance) / 100 }));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Unable to read Paystack balance" };
  }
}

export async function listBanks() {
  const json = await paystack<{ data: { name: string; code: string }[] }>(
    "/bank?currency=NGN&perPage=100",
  );
  return (json.data ?? []).map((b) => ({ name: b.name, code: b.code }));
}

export async function resolveAccount(accountNumber: string, bankCode: string) {
  const json = await paystack<{ data: { account_name: string; account_number: string } }>(
    `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
  );
  return { accountName: json.data.account_name, accountNumber: json.data.account_number };
}

/** Creates (or reuses) a Paystack transfer recipient and stores it. */
export async function saveRecipient(
  admin: AnyClient,
  userId: string,
  input: { accountNumber: string; bankCode: string; bankName: string },
) {
  const resolved = await resolveAccount(input.accountNumber, input.bankCode);

  const created = await paystack<{ data: { recipient_code: string } }>("/transferrecipient", {
    method: "POST",
    body: {
      type: "nuban",
      name: resolved.accountName,
      account_number: input.accountNumber,
      bank_code: input.bankCode,
      currency: "NGN",
    },
  });

  await admin.from("payout_recipients").update({ is_default: false }).neq("id", "00000000-0000-0000-0000-000000000000");

  const { data, error } = await admin
    .from("payout_recipients")
    .insert({
      account_name: resolved.accountName,
      account_number: input.accountNumber,
      bank_name: input.bankName,
      bank_code: input.bankCode,
      recipient_code: created.data.recipient_code,
      is_default: true,
      created_by: userId,
    })
    .select("id, account_name, account_number, bank_name, is_default")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** Initiates a Paystack transfer and records it in the payouts ledger. */
export async function requestPayout(
  admin: AnyClient,
  userId: string,
  input: { recipientId: string; amount: number; reason?: string },
) {
  const { data: recipient, error } = await admin
    .from("payout_recipients")
    .select("id, recipient_code, account_name, account_number, bank_name")
    .eq("id", input.recipientId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!recipient?.recipient_code) throw new Error("Bank account not found");

  const wallet = await buildWallet(admin);
  if (input.amount <= 0) throw new Error("Enter an amount greater than zero");
  if (input.amount > wallet.availableBalance) throw new Error("Amount exceeds available balance");

  const reference = `NXPO-${Date.now().toString(36).toUpperCase()}`;

  const { data: row, error: insertErr } = await admin
    .from("payouts")
    .insert({
      recipient_id: recipient.id,
      amount: input.amount,
      status: "pending",
      reference,
      reason: input.reason ?? "Nexovira wallet withdrawal",
      account_name: recipient.account_name,
      account_number: recipient.account_number,
      bank_name: recipient.bank_name,
      requested_by: userId,
    })
    .select("id")
    .single();
  if (insertErr) throw new Error(insertErr.message);

  try {
    const transfer = await paystack<{ data: { transfer_code: string; status: string } }>("/transfer", {
      method: "POST",
      body: {
        source: "balance",
        amount: Math.round(input.amount * 100),
        recipient: recipient.recipient_code,
        reason: input.reason ?? "Nexovira wallet withdrawal",
        reference,
        currency: "NGN",
      },
    });
    await admin
      .from("payouts")
      .update({ transfer_code: transfer.data.transfer_code, status: transfer.data.status ?? "pending" })
      .eq("id", row.id);
    return { ok: true, status: transfer.data.status ?? "pending", reference };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Transfer failed";
    await admin.from("payouts").update({ status: "failed", failure_reason: message }).eq("id", row.id);
    throw new Error(message);
  }
}
