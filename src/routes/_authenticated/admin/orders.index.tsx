import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatNaira } from "@/lib/cart";

export const Route = createFileRoute("/_authenticated/admin/orders/")({
  component: AdminOrders,
});

function AdminOrders() {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["admin", "orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Orders</h1>
        <p className="text-sm text-muted-foreground">All customer orders across the store.</p>
      </div>

      {isLoading ? <p className="text-muted-foreground">Loading…</p> : orders.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground border-dashed">No orders yet.</Card>
      ) : (
        <Card className="divide-y divide-border">
          {orders.map((o) => (
            <Link key={o.id} to="/admin/orders/$id" params={{ id: o.id }}
              className="flex flex-wrap items-center gap-4 p-4 hover:bg-accent/50 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{o.order_number}</div>
                <div className="text-xs text-muted-foreground">{o.full_name} · {o.email}</div>
              </div>
              <div className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</div>
              <Badge variant="secondary" className="capitalize">{o.status}</Badge>
              <div className="font-bold w-24 text-right">{formatNaira(Number(o.total))}</div>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
