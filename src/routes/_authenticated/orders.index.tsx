import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/site-header";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNaira } from "@/lib/cart";
import { Package } from "lucide-react";

export const Route = createFileRoute("/_authenticated/orders/")({
  head: () => ({ meta: [{ title: "My orders — NEXOVIRA" }, { name: "robots", content: "noindex" }] }),
  component: OrdersPage,
});

function OrdersPage() {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders", "mine"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-bold tracking-tight">My orders</h1>

        {isLoading ? (
          <p className="mt-8 text-muted-foreground">Loading…</p>
        ) : orders.length === 0 ? (
          <Card className="mt-8 p-12 text-center">
            <Package className="h-10 w-10 text-muted-foreground mx-auto" />
            <h2 className="mt-4 text-lg font-semibold">No orders yet</h2>
            <p className="text-sm text-muted-foreground mt-1">Your future orders will appear here.</p>
            <Button asChild className="mt-6"><Link to="/">Shop now</Link></Button>
          </Card>
        ) : (
          <div className="mt-8 space-y-3">
            {orders.map((o) => (
              <Link key={o.id} to="/orders/$id" params={{ id: o.id }}>
                <Card className="p-4 flex flex-wrap items-center gap-4 hover:shadow-lifted transition-shadow">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{o.order_number}</div>
                    <div className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</div>
                  </div>
                  <Badge variant="secondary" className="capitalize">{o.status}</Badge>
                  <div className="font-bold">{formatNaira(Number(o.total))}</div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
