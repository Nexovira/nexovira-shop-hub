import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Wallet summary: revenue ledger, payouts, live Paystack balance, saved banks. */
export const getAdminWallet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin, buildWallet, paystackBalance } = await import("./wallet.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const wallet = await buildWallet(supabaseAdmin);
    const balance = await paystackBalance();
    const { data: recipients } = await supabaseAdmin
      .from("payout_recipients")
      .select("id, account_name, account_number, bank_name, is_default, created_at")
      .order("created_at", { ascending: false });

    return { ...wallet, paystackBalance: balance, recipients: recipients ?? [] };
  });

/** Nigerian bank list from Paystack, for the payout form. */
export const getBanks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin, listBanks } = await import("./wallet.server");
    await assertAdmin(context.supabase, context.userId);
    return listBanks();
  });

/** Verifies account details with Paystack before saving. */
export const verifyBankAccount = createServerFn({ method: "POST" })
  .inputValidator((input: { accountNumber: string; bankCode: string }) => {
    if (!/^\d{10}$/.test(input?.accountNumber ?? "")) throw new Error("Account number must be 10 digits");
    if (!input?.bankCode) throw new Error("Select a bank");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { assertAdmin, resolveAccount } = await import("./wallet.server");
    await assertAdmin(context.supabase, context.userId);
    return resolveAccount(data.accountNumber, data.bankCode);
  });

/** Saves a verified bank account as the default payout destination. */
export const addPayoutAccount = createServerFn({ method: "POST" })
  .inputValidator((input: { accountNumber: string; bankCode: string; bankName: string }) => {
    if (!/^\d{10}$/.test(input?.accountNumber ?? "")) throw new Error("Account number must be 10 digits");
    if (!input?.bankCode || !input?.bankName) throw new Error("Select a bank");
    return input;
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { assertAdmin, saveRecipient } = await import("./wallet.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return saveRecipient(supabaseAdmin, context.userId, data);
  });

/** Sends money from the Paystack balance to a saved bank account. */
export const withdrawToBank = createServerFn({ method: "POST" })
  .inputValidator((input: { recipientId: string; amount: number; reason?: string }) => {
    if (!input?.recipientId) throw new Error("Select a bank account");
    const amount = Number(input?.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount");
    return { recipientId: input.recipientId, amount, reason: input.reason };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { assertAdmin, requestPayout } = await import("./wallet.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return requestPayout(supabaseAdmin, context.userId, data);
  });
