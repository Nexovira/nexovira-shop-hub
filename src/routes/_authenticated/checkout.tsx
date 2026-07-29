import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useCart, formatNaira } from "@/lib/cart";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/checkout")({
  head: () => ({ meta: [{ title: "Checkout — NEXOVIRA" }, { name: "robots", content: "noindex" }] }),
  component: CheckoutPage,
});

type Zone = {
  id: string;
  name: string;
  state: string;
  area: string | null;
  fee: number;
};

function CheckoutPage() {
  const navigate = useNavigate();
  const { items, subtotal, clear } = useCart();
  const [loading, setLoading] = useState(false);
  const [zoneId, setZoneId] = useState<string>("");
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    address_line1: "",
    address_line2: "",
    city: "",
    notes: "",
  });

  const { data: zones } = useQuery({
    queryKey: ["shipping_zones", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shipping_zones")
        .select("id, name, state, area, fee")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as Zone[];
    },
  });

  const selectedZone = useMemo(() => zones?.find((z) => z.id === zoneId) ?? null, [zones, zoneId]);
  const shipping = selectedZone ? Number(selectedZone.fee) : 0;
  const total = subtotal + shipping;

  function up<K extends keyof typeof form>(k: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (items.length === 0) return toast.error("Your cart is empty");
    if (!selectedZone) return toast.error("Please select a delivery zone");
    setLoading(true);

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) { setLoading(false); return toast.error("Please sign in"); }

    const { data: order, error: orderErr } = await supabase.from("orders").insert({
      user_id: user.id,
      email: form.email || user.email!,
      full_name: form.full_name,
      phone: form.phone,
      address_line1: form.address_line1,
      address_line2: form.address_line2 || null,
      city: form.city,
      state: selectedZone.state,
      shipping_zone_id: selectedZone.id,
      notes: form.notes || null,
      subtotal, shipping_fee: shipping, total,
      status: "pending",
      payment_provider: "cash_on_delivery",
    }).select("id, order_number").single();

    if (orderErr || !order) {
      setLoading(false);
      return toast.error(orderErr?.message || "Could not create order");
    }

    const itemsPayload = items.map((i) => ({
      order_id: order.id,
      product_id: i.productId,
      title: i.title,
      unit_price: i.price,
      quantity: i.quantity,
      image_url: i.imageUrl || null,
    }));
    const { error: itemsErr } = await supabase.from("order_items").insert(itemsPayload);
    if (itemsErr) {
      setLoading(false);
      return toast.error(itemsErr.message);
    }

    clear();
    setLoading(false);
    toast.success(`Order ${order.order_number} placed!`);
    navigate({ to: "/orders/$id", params: { id: order.id } });
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Checkout</h1>

        <form onSubmit={handleSubmit} className="mt-8 grid lg:grid-cols-3 gap-8">
          <Card className="lg:col-span-2 p-6 space-y-4">
            <h2 className="text-lg font-semibold">Delivery details</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Full name</Label><Input required value={form.full_name} onChange={up("full_name")} /></div>
              <div className="space-y-2"><Label>Phone</Label><Input required type="tel" value={form.phone} onChange={up("phone")} /></div>
              <div className="space-y-2 sm:col-span-2"><Label>Email</Label><Input required type="email" value={form.email} onChange={up("email")} /></div>
              <div className="space-y-2 sm:col-span-2"><Label>Address line 1</Label><Input required value={form.address_line1} onChange={up("address_line1")} /></div>
              <div className="space-y-2 sm:col-span-2"><Label>Address line 2 (optional)</Label><Input value={form.address_line2} onChange={up("address_line2")} /></div>
              <div className="space-y-2"><Label>City / town</Label><Input required value={form.city} onChange={up("city")} /></div>
              <div className="space-y-2">
                <Label>Delivery zone</Label>
                <Select value={zoneId} onValueChange={setZoneId}>
                  <SelectTrigger><SelectValue placeholder="Select a zone" /></SelectTrigger>
                  <SelectContent>
                    {zones?.map((z) => (
                      <SelectItem key={z.id} value={z.id}>
                        {z.name} — {formatNaira(Number(z.fee))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedZone?.area && (
                  <p className="text-xs text-muted-foreground">{selectedZone.area}</p>
                )}
              </div>
              <div className="space-y-2 sm:col-span-2"><Label>Order notes (optional)</Label><Textarea rows={3} value={form.notes} onChange={up("notes")} /></div>
            </div>

            <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              <strong className="text-foreground">Payment:</strong> Cash on delivery. Card & Paystack payments will be enabled once merchant keys are added.
            </div>
          </Card>

          <Card className="p-6 h-fit space-y-4">
            <h2 className="text-lg font-semibold">Order summary</h2>
            <ul className="space-y-3 text-sm">
              {items.map((i) => (
                <li key={i.productId} className="flex justify-between gap-2">
                  <span className="line-clamp-1">{i.title} × {i.quantity}</span>
                  <span className="whitespace-nowrap">{formatNaira(i.price * i.quantity)}</span>
                </li>
              ))}
            </ul>
            <dl className="pt-4 border-t border-border space-y-1 text-sm">
              <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatNaira(subtotal)}</dd></div>
              <div className="flex justify-between">
                <dt>Shipping{selectedZone ? ` (${selectedZone.name})` : ""}</dt>
                <dd>{selectedZone ? formatNaira(shipping) : <span className="text-muted-foreground">Select zone</span>}</dd>
              </div>
              <div className="pt-2 border-t border-border flex justify-between font-bold text-base">
                <dt>Total</dt><dd>{formatNaira(total)}</dd>
              </div>
            </dl>
            <Button type="submit" size="lg" disabled={loading || items.length === 0 || !selectedZone}
              className="w-full bg-accent-gradient text-primary font-semibold hover:opacity-90">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Place order
            </Button>
          </Card>
        </form>
      </div>
    </div>
  );
}
