import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/site-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { formatNaira } from "@/lib/cart";
import { ArrowDownLeft, ArrowUpRight, Gift, Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/wallet")({
  head: () => ({
    meta: [
      { title: "Store Credit Wallet — NEXOVIRA" },
      {
        name: "description",
        content:
          "Track your NEXOVIRA store credit balance, referral rewards earned and credit spent on orders.",
      },
      { property: "og:title", content: "Store Credit Wallet — NEXOVIRA" },
      {
        property: "og:description",
        content: "Your NEXOVIRA store credit balance and full transaction history.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WalletPage,
});

function WalletPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["wallet", "me"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not signed in");

      const [profileRes, txRes] = await Promise.all([
        supabase.from("profiles").select("credit_balance").eq("id", uid).maybeSingle(),
        supabase
          .from("credit_transactions")
          .select("id, amount, reason, order_id, created_at")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      const transactions = txRes.data ?? [];
      return {
        balance: Number(profileRes.data?.credit_balance ?? 0),
        transactions,
        earned: transactions
          .filter((t) => Number(t.amount) > 0)
          .reduce((s, t) => s + Number(t.amount), 0),
        spent: transactions
          .filter((t) => Number(t.amount) < 0)
          .reduce((s, t) => s + Math.abs(Number(t.amount)), 0),
      };
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Store credit wallet</h1>
        <p className="mt-2 text-muted-foreground">
          Credit earned from referrals is added here automatically and can be applied to any order at
          checkout.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Card className="p-5 bg-hero text-white">
            <div className="flex items-center gap-2 text-sm text-white/70">
              <Wallet className="h-4 w-4" /> Available balance
            </div>
            <div className="mt-2 text-3xl font-bold">{formatNaira(data?.balance ?? 0)}</div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ArrowDownLeft className="h-4 w-4" /> Total earned
            </div>
            <div className="mt-2 text-2xl font-bold">{formatNaira(data?.earned ?? 0)}</div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ArrowUpRight className="h-4 w-4" /> Total spent
            </div>
            <div className="mt-2 text-2xl font-bold">{formatNaira(data?.spent ?? 0)}</div>
          </Card>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/cart">Spend credit at checkout</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/referrals">
              <Gift className="mr-2 h-4 w-4" /> Earn more credit
            </Link>
          </Button>
        </div>

        <Card className="mt-8 p-6">
          <h2 className="font-semibold">Transaction history</h2>
          {isLoading ? (
            <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
          ) : (data?.transactions.length ?? 0) === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No credit activity yet. Invite a friend to earn your first ₦2,000.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {data!.transactions.map((t) => {
                const amount = Number(t.amount);
                const positive = amount > 0;
                return (
                  <li key={t.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{t.reason || "Adjustment"}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(t.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {t.order_id && (
                        <Badge variant="secondary" className="hidden sm:inline-flex">
                          Order
                        </Badge>
                      )}
                      <span
                        className={`text-sm font-semibold ${positive ? "text-primary" : "text-muted-foreground"}`}
                      >
                        {positive ? "+" : "−"}
                        {formatNaira(Math.abs(amount))}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
