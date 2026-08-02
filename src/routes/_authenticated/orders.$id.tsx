import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/site-header";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNaira } from "@/lib/cart";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/orders/$id")({
  head: () => ({ meta: [{ title: "Order details — NEXOVIRA" }, { name: "robots", content: "noindex" }] }),
  component: OrderDetail,
});

function OrderDetail() {
  const { id } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["order", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*, order_items(*)").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-10">
        {isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : !data ? (
          <Card className="p-10 text-center">
            <h1 className="text-xl font-bold">Order not found</h1>
            <Button asChild className="mt-4"><Link to="/orders">Back to orders</Link></Button>
          </Card>
        ) : (
          <>
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <div className="inline-flex items-center gap-2 text-sm text-primary">
                  <CheckCircle2 className="h-4 w-4" /> Order confirmed
                </div>
                <h1 className="mt-1 text-3xl font-bold tracking-tight">{data.order_number}</h1>
                <p className="text-sm text-muted-foreground">Placed {new Date(data.created_at).toLocaleString()}</p>
              </div>
              <Badge variant="secondary" className="capitalize text-sm">{data.status}</Badge>
            </div>

            <div className="mt-8 grid lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2 p-6">
                <h2 className="font-semibold mb-4">Items</h2>
                <ul className="divide-y divide-border">
                  {data.order_items.map((it: any) => (
                    <li key={it.id} className="py-3 flex gap-4">
                      <div className="h-16 w-16 rounded-md bg-muted overflow-hidden shrink-0">
                        {it.image_url && <img src={it.image_url} alt={it.title} className="h-full w-full object-cover" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium line-clamp-1">{it.title}</div>
                        <div className="text-xs text-muted-foreground">Qty {it.quantity} · {formatNaira(Number(it.unit_price))}</div>
                      </div>
                      <div className="font-semibold">{formatNaira(Number(it.unit_price) * it.quantity)}</div>
                    </li>
                  ))}
                </ul>
              </Card>

              <div className="space-y-4">
                <Card className="p-6">
                  <h2 className="font-semibold mb-3">Summary</h2>
                  <dl className="text-sm space-y-1">
                    <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatNaira(Number(data.subtotal))}</dd></div>
                    <div className="flex justify-between"><dt>Shipping</dt><dd>{formatNaira(Number(data.shipping_fee))}</dd></div>
                    {Number(data.credit_applied ?? 0) > 0 && (
                      <div className="flex justify-between text-primary">
                        <dt>Store credit applied</dt>
                        <dd>−{formatNaira(Number(data.credit_applied))}</dd>
                      </div>
                    )}
                    <div className="pt-2 mt-2 border-t border-border flex justify-between font-bold">
                      <dt>Total</dt><dd>{formatNaira(Number(data.total))}</dd>
                    </div>
                  </dl>
                </Card>
                <Card className="p-6">
                  <h2 className="font-semibold mb-3">Delivery</h2>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <div className="text-foreground font-medium">{data.full_name}</div>
                    <div>{data.phone}</div>
                    <div>{data.address_line1}</div>
                    {data.address_line2 && <div>{data.address_line2}</div>}
                    <div>{data.city}, {data.state}</div>
                  </div>
                </Card>
              </div>
            </div>

            <div className="mt-8 flex gap-3">
              <Button asChild variant="outline"><Link to="/orders">All orders</Link></Button>
              <Button asChild><Link to="/">Continue shopping</Link></Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
