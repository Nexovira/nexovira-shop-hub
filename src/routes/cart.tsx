import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCart, formatNaira } from "@/lib/cart";
import { Trash2, ShoppingBag, ArrowRight, Minus, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Your cart — NEXOVIRA" },
      { name: "description", content: "Review items in your NEXOVIRA cart." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const { items, subtotal, update, remove } = useCart();
  const navigate = useNavigate();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user));
  }, []);

  const shipping = subtotal > 0 ? 2500 : 0;
  const total = subtotal + shipping;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Your cart</h1>

        {items.length === 0 ? (
          <Card className="mt-8 p-12 text-center">
            <ShoppingBag className="h-10 w-10 text-muted-foreground mx-auto" />
            <h2 className="mt-4 text-lg font-semibold">Your cart is empty</h2>
            <p className="text-sm text-muted-foreground mt-1">Discover our latest appliances.</p>
            <Button asChild className="mt-6"><Link to="/">Start shopping</Link></Button>
          </Card>
        ) : (
          <div className="mt-8 grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              {items.map((item) => (
                <Card key={item.productId} className="p-4 flex gap-4">
                  <Link to="/products/$slug" params={{ slug: item.slug }} className="h-24 w-24 shrink-0 overflow-hidden rounded-md bg-muted">
                    {item.imageUrl
                      ? <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" />
                      : <div className="h-full w-full" />}
                  </Link>
                  <div className="flex-1 min-w-0">
                    <Link to="/products/$slug" params={{ slug: item.slug }} className="font-semibold hover:underline line-clamp-2">{item.title}</Link>
                    <div className="mt-1 text-sm text-muted-foreground">{formatNaira(item.price)} each</div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="inline-flex items-center rounded-md border border-input">
                        <Button variant="ghost" size="icon" onClick={() => update(item.productId, item.quantity - 1)}><Minus className="h-3 w-3" /></Button>
                        <Input type="number" min={1} value={item.quantity} onChange={(e) => update(item.productId, Number(e.target.value) || 1)}
                          className="h-9 w-14 border-0 text-center focus-visible:ring-0" />
                        <Button variant="ghost" size="icon" onClick={() => update(item.productId, item.quantity + 1)}><Plus className="h-3 w-3" /></Button>
                      </div>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove(item.productId)}>
                        <Trash2 className="h-4 w-4 mr-1" /> Remove
                      </Button>
                    </div>
                  </div>
                  <div className="text-right font-semibold">{formatNaira(item.price * item.quantity)}</div>
                </Card>
              ))}
            </div>

            <Card className="p-6 h-fit sticky top-24">
              <h2 className="text-lg font-semibold">Order summary</h2>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatNaira(subtotal)}</dd></div>
                <div className="flex justify-between"><dt>Shipping (flat rate)</dt><dd>{formatNaira(shipping)}</dd></div>
                <div className="border-t border-border pt-3 flex justify-between font-bold text-base">
                  <dt>Total</dt><dd>{formatNaira(total)}</dd>
                </div>
              </dl>
              <Button
                className="w-full mt-6 bg-accent-gradient text-primary font-semibold hover:opacity-90"
                onClick={() => navigate({ to: signedIn ? "/checkout" : "/auth" })}
                disabled={signedIn === null}
              >
                {signedIn ? "Proceed to checkout" : "Sign in to checkout"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <p className="mt-3 text-xs text-muted-foreground text-center">Delivered nationwide across Nigeria.</p>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
