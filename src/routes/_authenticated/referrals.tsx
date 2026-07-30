import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { formatNaira } from "@/lib/cart";
import { Copy, Gift, Users, Wallet } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/referrals")({
  head: () => ({
    meta: [
      { title: "Refer & Earn — NEXOVIRA" },
      { name: "description", content: "Invite friends to NEXOVIRA and earn ₦2,000 store credit for every referral that buys." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReferralsPage,
});

function ReferralsPage() {
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["referrals", "me"],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not signed in");

      const [profileRes, referralsRes, creditsRes] = await Promise.all([
        supabase.from("profiles").select("referral_code, credit_balance").eq("id", uid).maybeSingle(),
        supabase.from("referrals").select("id, status, reward_amount, created_at").eq("referrer_id", uid).order("created_at", { ascending: false }),
        supabase.from("credit_transactions").select("id, amount, reason, created_at").order("created_at", { ascending: false }).limit(20),
      ]);

      return {
        code: profileRes.data?.referral_code ?? null,
        balance: Number(profileRes.data?.credit_balance ?? 0),
        referrals: referralsRes.data ?? [],
        credits: creditsRes.data ?? [],
      };
    },
  });

  const link = typeof window !== "undefined" && data?.code
    ? `${window.location.origin}/?ref=${data.code}`
    : "";

  const credited = data?.referrals.filter((r) => r.status === "credited").length ?? 0;
  const pending = data?.referrals.filter((r) => r.status === "pending").length ?? 0;

  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Referral link copied");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Refer &amp; earn</h1>
        <p className="mt-2 text-muted-foreground">
          Share your link. When a friend signs up and completes their first paid order, you get{" "}
          <strong className="text-foreground">₦2,000</strong> store credit to spend at checkout.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Card className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground text-sm"><Wallet className="h-4 w-4" /> Store credit</div>
            <div className="mt-2 text-2xl font-bold">{formatNaira(data?.balance ?? 0)}</div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground text-sm"><Gift className="h-4 w-4" /> Rewarded</div>
            <div className="mt-2 text-2xl font-bold">{credited}</div>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground text-sm"><Users className="h-4 w-4" /> Pending</div>
            <div className="mt-2 text-2xl font-bold">{pending}</div>
          </Card>
        </div>

        <Card className="mt-6 p-6 space-y-3">
          <h2 className="text-lg font-semibold">Your referral link</h2>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input readOnly value={link} className="font-mono text-xs" />
                <Button onClick={copy} className="bg-accent-gradient text-primary font-semibold hover:opacity-90">
                  <Copy className="mr-2 h-4 w-4" /> {copied ? "Copied" : "Copy link"}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Code: <span className="font-mono font-semibold text-foreground">{data?.code}</span>
              </p>
            </>
          )}
        </Card>

        <Card className="mt-6 p-6">
          <h2 className="text-lg font-semibold">Referral activity</h2>
          {(data?.referrals.length ?? 0) === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No referrals yet — share your link to get started.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border text-sm">
              {data!.referrals.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-3">
                  <span className="text-muted-foreground">
                    Invited on {new Date(r.created_at).toLocaleDateString()}
                  </span>
                  <span className="flex items-center gap-3">
                    <span>{formatNaira(Number(r.reward_amount))}</span>
                    <Badge variant={r.status === "credited" ? "default" : "secondary"}>{r.status}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="mt-6 p-6">
          <h2 className="text-lg font-semibold">Credit history</h2>
          {(data?.credits.length ?? 0) === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No credit activity yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border text-sm">
              {data!.credits.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-3">
                  <span>{c.reason}</span>
                  <span className={Number(c.amount) >= 0 ? "text-emerald-500" : "text-muted-foreground"}>
                    {Number(c.amount) >= 0 ? "+" : "−"}{formatNaira(Math.abs(Number(c.amount)))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="mt-8">
          <Button asChild variant="outline"><Link to="/">Continue shopping</Link></Button>
        </div>
      </div>
    </div>
  );
}
