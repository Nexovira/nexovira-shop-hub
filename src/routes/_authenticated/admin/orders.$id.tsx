import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatNaira } from "@/lib/cart";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const STATUSES = ["pending", "paid", "processing", "shipped", "delivered", "cancelled", "refunded"] as const;

export const Route = createFileRoute("/_authenticated/admin/orders/$id")({
  component: AdminOrderDetail,
});

function AdminOrderDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "order", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*, order_items(*)").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  async function updateStatus(status: string) {
    const { error } = await supabase.from("orders").update({ status: status as any }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Status updated");
    qc.invalidateQueries({ queryKey: ["admin", "order", id] });
    qc.invalidateQueries({ queryKey: ["admin", "orders"] });
  }

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!data) return (
    <Card className="p-10 text-center">
      <h1 className="text-xl font-bold">Order not found</h1>
      <Button asChild className="mt-4"><Link to="/admin/orders">Back</Link></Button>
    </Card>
  );

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link to="/admin/orders"><ArrowLeft className="h-4 w-4 mr-2" />All orders</Link>
      </Button>

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">{data.order_number}</h1>
          <p className="text-sm text-muted-foreground">Placed {new Date(data.created_at).toLocaleString()}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="capitalize">{data.status}</Badge>
          <Select value={data.status} onValueChange={updateStatus}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
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
          <div className="mt-4 pt-4 border-t border-border grid grid-cols-3 text-sm">
            <div><div className="text-muted-foreground">Subtotal</div><div>{formatNaira(Number(data.subtotal))}</div></div>
            <div><div className="text-muted-foreground">Shipping</div><div>{formatNaira(Number(data.shipping_fee))}</div></div>
            <div><div className="text-muted-foreground">Total</div><div className="font-bold">{formatNaira(Number(data.total))}</div></div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-6">
            <h2 className="font-semibold mb-3">Customer</h2>
            <div className="text-sm space-y-1">
              <div className="font-medium">{data.full_name}</div>
              <div className="text-muted-foreground">{data.email}</div>
              <div className="text-muted-foreground">{data.phone}</div>
            </div>
          </Card>
          <Card className="p-6">
            <h2 className="font-semibold mb-3">Shipping address</h2>
            <div className="text-sm text-muted-foreground space-y-1">
              <div>{data.address_line1}</div>
              {data.address_line2 && <div>{data.address_line2}</div>}
              <div>{data.city}, {data.state}</div>
            </div>
            {data.notes && (
              <>
                <h3 className="font-semibold mt-4 mb-1 text-sm">Notes</h3>
                <p className="text-sm text-muted-foreground">{data.notes}</p>
              </>
            )}
          </Card>
          <Card className="p-6">
            <h2 className="font-semibold mb-3">Payment</h2>
            <div className="text-sm text-muted-foreground">
              <div>Provider: {data.payment_provider || "—"}</div>
              <div>Reference: {data.payment_reference || "—"}</div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
