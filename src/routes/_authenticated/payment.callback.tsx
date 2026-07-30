import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/site-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { verifyPayment } from "@/lib/checkout.functions";
import { useCart } from "@/lib/cart";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/payment/callback")({
  head: () => ({ meta: [{ title: "Confirming payment — NEXOVIRA" }, { name: "robots", content: "noindex" }] }),
  component: PaymentCallbackPage,
});

function PaymentCallbackPage() {
  const navigate = useNavigate();
  const verify = useServerFn(verifyPayment);
  const { clear } = useCart();
  const [state, setState] = useState<"loading" | "paid" | "failed">("loading");
  const [message, setMessage] = useState("Confirming your payment with Paystack…");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference") || params.get("trxref");
    if (!reference) {
      setState("failed");
      setMessage("No payment reference found.");
      return;
    }
    verify({ data: { reference } })
      .then((res) => {
        if (res.paid) {
          clear();
          setState("paid");
          setTimeout(() => navigate({ to: "/orders/$id", params: { id: res.orderId } }), 1200);
        } else {
          setState("failed");
          setMessage(`Payment was not completed (${res.status}).`);
        }
      })
      .catch((e: Error) => {
        setState("failed");
        setMessage(e.message || "We could not verify this payment.");
      });
  }, [verify, navigate, clear]);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-lg px-4 py-20">
        <Card className="p-8 text-center space-y-4">
          {state === "loading" && <Loader2 className="mx-auto h-10 w-10 animate-spin text-muted-foreground" />}
          {state === "paid" && <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />}
          {state === "failed" && <XCircle className="mx-auto h-10 w-10 text-destructive" />}
          <h1 className="text-xl font-semibold">
            {state === "paid" ? "Payment successful" : state === "failed" ? "Payment not confirmed" : "Please wait"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {state === "paid" ? "Taking you to your order…" : message}
          </p>
          {state === "failed" && (
            <div className="flex justify-center gap-2 pt-2">
              <Button asChild variant="outline"><Link to="/orders">My orders</Link></Button>
              <Button asChild><Link to="/cart">Back to cart</Link></Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
