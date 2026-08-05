import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Wallet, ArrowDownRight, ArrowUpRight, Banknote } from "lucide-react";
import { formatNaira } from "@/lib/cart";
import {
  getAdminWallet, getBanks, verifyBankAccount, addPayoutAccount, withdrawToBank,
} from "@/lib/wallet.functions";

export const Route = createFileRoute("/_authenticated/admin/wallet")({
  component: AdminWallet,
});

function AdminWallet() {
  const qc = useQueryClient();
  const fetchWallet = useServerFn(getAdminWallet);
  const fetchBanks = useServerFn(getBanks);
  const verifyFn = useServerFn(verifyBankAccount);
  const addFn = useServerFn(addPayoutAccount);
  const withdrawFn = useServerFn(withdrawToBank);

  const wallet = useQuery({ queryKey: ["admin", "wallet"], queryFn: () => fetchWallet({}) });
  const banks = useQuery({ queryKey: ["admin", "banks"], queryFn: () => fetchBanks({}), staleTime: 3_600_000 });

  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [resolvedName, setResolvedName] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [recipientId, setRecipientId] = useState("");

  const bankName = banks.data?.find((b) => b.code === bankCode)?.name ?? "";

  const verify = useMutation({
    mutationFn: () => verifyFn({ data: { accountNumber, bankCode } }),
    onSuccess: (r) => { setResolvedName(r.accountName); toast.success(`Account verified: ${r.accountName}`); },
    onError: (e: Error) => { setResolvedName(null); toast.error(e.message); },
  });

  const addAccount = useMutation({
    mutationFn: () => addFn({ data: { accountNumber, bankCode, bankName } }),
    onSuccess: () => {
      toast.success("Bank account saved");
      setAccountNumber(""); setBankCode(""); setResolvedName(null);
      qc.invalidateQueries({ queryKey: ["admin", "wallet"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const withdraw = useMutation({
    mutationFn: () => withdrawFn({ data: { recipientId, amount: Number(amount) } }),
    onSuccess: (r) => {
      toast.success(`Payout ${r.status} — ref ${r.reference}`);
      setAmount("");
      qc.invalidateQueries({ queryKey: ["admin", "wallet"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const data = wallet.data;
  const balance = data?.paystackBalance;
  const balanceError = balance && "error" in balance ? balance.error : null;
  const balanceRows = Array.isArray(balance) ? balance : [];
  const recipients = data?.recipients ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Wallet</h1>
        <p className="text-sm text-muted-foreground">Store earnings, Paystack balance and bank payouts.</p>
      </div>

      {wallet.isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading wallet…</div>
      ) : wallet.error ? (
        <Card><CardContent className="p-6 text-sm text-destructive">{(wallet.error as Error).message}</CardContent></Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={<Wallet className="h-4 w-4" />} label="Available balance" value={formatNaira(data!.availableBalance)} />
            <StatCard icon={<ArrowDownRight className="h-4 w-4" />} label="Total earnings" value={formatNaira(data!.grossRevenue)} hint={`${data!.paidOrders} paid orders`} />
            <StatCard icon={<ArrowUpRight className="h-4 w-4" />} label="Paid out" value={formatNaira(data!.totalPaidOut)} />
            <StatCard
              icon={<Banknote className="h-4 w-4" />}
              label="Paystack balance"
              value={balanceRows.length ? balanceRows.map((b) => `${b.currency} ${b.amount.toLocaleString()}`).join(" · ") : "—"}
              hint={balanceError ?? undefined}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Add bank account</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Bank</Label>
                  <Select value={bankCode} onValueChange={(v) => { setBankCode(v); setResolvedName(null); }}>
                    <SelectTrigger><SelectValue placeholder={banks.isLoading ? "Loading banks…" : "Select bank"} /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {(banks.data ?? []).map((b) => (
                        <SelectItem key={b.code} value={b.code}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {banks.error && <p className="text-xs text-destructive">{(banks.error as Error).message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="acct">Account number</Label>
                  <Input id="acct" inputMode="numeric" maxLength={10} value={accountNumber}
                    onChange={(e) => { setAccountNumber(e.target.value.replace(/\D/g, "")); setResolvedName(null); }}
                    placeholder="0123456789" />
                </div>
                {resolvedName && (
                  <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">Account name: </span><span className="font-medium">{resolvedName}</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" disabled={!bankCode || accountNumber.length !== 10 || verify.isPending}
                    onClick={() => verify.mutate()}>
                    {verify.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Verify
                  </Button>
                  <Button disabled={!resolvedName || addAccount.isPending} onClick={() => addAccount.mutate()}>
                    {addAccount.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save account
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Withdraw</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {recipients.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Add and verify a bank account first.</p>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>Destination</Label>
                      <Select value={recipientId} onValueChange={setRecipientId}>
                        <SelectTrigger><SelectValue placeholder="Select bank account" /></SelectTrigger>
                        <SelectContent>
                          {recipients.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.bank_name} ••{r.account_number.slice(-4)} — {r.account_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="amt">Amount (₦)</Label>
                      <Input id="amt" inputMode="decimal" value={amount}
                        onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="50000" />
                      <p className="text-xs text-muted-foreground">Available: {formatNaira(data!.availableBalance)}</p>
                    </div>
                    <Button className="w-full" disabled={!recipientId || !amount || withdraw.isPending}
                      onClick={() => withdraw.mutate()}>
                      {withdraw.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send payout
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Transaction history</CardTitle></CardHeader>
            <CardContent className="p-0">
              {data!.entries.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No transactions yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {data!.entries.map((e) => (
                    <li key={`${e.kind}-${e.id}`} className="flex items-center gap-3 px-4 py-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{e.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(e.created_at).toLocaleString()}{e.reference ? ` · ${e.reference}` : ""}
                        </div>
                      </div>
                      <Badge variant={e.kind === "payout" ? "outline" : "secondary"}>{e.status}</Badge>
                      <div className={`w-28 shrink-0 text-right font-semibold ${e.amount < 0 ? "text-destructive" : ""}`}>
                        {e.amount < 0 ? "-" : "+"}{formatNaira(Math.abs(e.amount))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">{icon}{label}</div>
        <div className="mt-2 text-xl font-bold">{value}</div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}
