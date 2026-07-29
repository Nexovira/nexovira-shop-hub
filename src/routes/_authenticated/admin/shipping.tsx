import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { formatNaira } from "@/lib/cart";

export const Route = createFileRoute("/_authenticated/admin/shipping")({
  head: () => ({ meta: [{ title: "Shipping zones — Admin" }, { name: "robots", content: "noindex" }] }),
  component: ShippingZonesPage,
});

type Zone = {
  id: string;
  name: string;
  state: string;
  area: string | null;
  fee: number;
  sort_order: number;
  is_active: boolean;
};

function ShippingZonesPage() {
  const qc = useQueryClient();
  const { data: zones, isLoading } = useQuery({
    queryKey: ["admin", "shipping_zones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shipping_zones")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as Zone[];
    },
  });

  const [editing, setEditing] = useState<Zone | null>(null);
  const [open, setOpen] = useState(false);

  async function toggleActive(z: Zone) {
    const { error } = await supabase
      .from("shipping_zones")
      .update({ is_active: !z.is_active })
      .eq("id", z.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin", "shipping_zones"] });
  }

  async function del(z: Zone) {
    if (!confirm(`Delete zone "${z.name}"?`)) return;
    const { error } = await supabase.from("shipping_zones").delete().eq("id", z.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["admin", "shipping_zones"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Shipping zones</h1>
          <p className="text-sm text-muted-foreground">Set delivery fees per city or area. Customers pick one at checkout.</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditing(null); setOpen(true); }} className="bg-accent-gradient text-primary font-semibold">
              <Plus className="mr-2 h-4 w-4" /> New zone
            </Button>
          </DialogTrigger>
          <ZoneDialog
            zone={editing}
            onClose={() => { setOpen(false); setEditing(null); }}
            onSaved={() => qc.invalidateQueries({ queryKey: ["admin", "shipping_zones"] })}
          />
        </Dialog>
      </div>

      <Card className="p-4">
        {isLoading ? (
          <div className="p-6 flex justify-center"><Loader2 className="animate-spin h-5 w-5" /></div>
        ) : !zones || zones.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No shipping zones yet. Add your first one.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground border-b border-border">
                <tr>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">State</th>
                  <th className="py-2 pr-4">Area</th>
                  <th className="py-2 pr-4">Fee</th>
                  <th className="py-2 pr-4">Order</th>
                  <th className="py-2 pr-4">Active</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((z) => (
                  <tr key={z.id} className="border-b border-border last:border-0">
                    <td className="py-3 pr-4 font-medium">{z.name}</td>
                    <td className="py-3 pr-4">{z.state}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{z.area || "—"}</td>
                    <td className="py-3 pr-4">{formatNaira(Number(z.fee))}</td>
                    <td className="py-3 pr-4">{z.sort_order}</td>
                    <td className="py-3 pr-4"><Switch checked={z.is_active} onCheckedChange={() => toggleActive(z)} /></td>
                    <td className="py-3 text-right space-x-1">
                      <Button variant="ghost" size="icon" onClick={() => { setEditing(z); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => del(z)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function ZoneDialog({ zone, onClose, onSaved }: { zone: Zone | null; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: zone?.name ?? "",
    state: zone?.state ?? "",
    area: zone?.area ?? "",
    fee: zone?.fee?.toString() ?? "0",
    sort_order: zone?.sort_order?.toString() ?? "100",
    is_active: zone?.is_active ?? true,
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      state: form.state.trim(),
      area: form.area.trim() || null,
      fee: Number(form.fee) || 0,
      sort_order: Number(form.sort_order) || 0,
      is_active: form.is_active,
    };
    const { error } = zone
      ? await supabase.from("shipping_zones").update(payload).eq("id", zone.id)
      : await supabase.from("shipping_zones").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(zone ? "Zone updated" : "Zone created");
    onSaved();
    onClose();
  }

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>{zone ? "Edit zone" : "New shipping zone"}</DialogTitle></DialogHeader>
      <form onSubmit={save} className="space-y-4">
        <div className="space-y-2"><Label>Name</Label>
          <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Lagos Island" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label>State</Label>
            <Input required value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="Lagos" />
          </div>
          <div className="space-y-2"><Label>Delivery fee (₦)</Label>
            <Input required type="number" min={0} step="100" value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} />
          </div>
        </div>
        <div className="space-y-2"><Label>Area / description (optional)</Label>
          <Input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="VI, Lekki Phase 1, Ikoyi" />
        </div>
        <div className="grid grid-cols-2 gap-3 items-end">
          <div className="space-y-2"><Label>Sort order</Label>
            <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
          </div>
          <div className="flex items-center gap-3 pb-2">
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            <Label>Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving} className="bg-accent-gradient text-primary font-semibold">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
