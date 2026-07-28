import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, Pencil, Trash2, Copy, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { slugify } from "@/lib/storage";

export const Route = createFileRoute("/_authenticated/admin/products/")({
  component: ProductsList,
});

function ProductsList() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["admin", "products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, title, slug, price, discount_price, sku, stock_quantity, status, is_featured, product_images(image_url, is_primary)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const toggleStatus = useMutation({
    mutationFn: async (p: { id: string; status: "draft" | "published" }) => {
      const next = p.status === "published" ? "draft" : "published";
      const { error } = await supabase.from("products").update({ status: next }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "products"] }); toast.success("Status updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "products"] }); toast.success("Product deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  const duplicate = useMutation({
    mutationFn: async (id: string) => {
      const { data: p, error } = await supabase.from("products").select("*").eq("id", id).single();
      if (error) throw error;
      const { id: _i, created_at: _c, updated_at: _u, slug: _s, sku: _sku, ...rest } = p as any;
      const newTitle = `${p.title} (Copy)`;
      const { data: inserted, error: insErr } = await supabase.from("products").insert({
        ...rest, title: newTitle, slug: `${slugify(newTitle)}-${Date.now().toString(36)}`,
        sku: p.sku ? `${p.sku}-COPY-${Date.now().toString(36)}` : null,
        status: "draft",
      }).select("id").single();
      if (insErr) throw insErr;
      return inserted.id as string;
    },
    onSuccess: (id) => { qc.invalidateQueries({ queryKey: ["admin", "products"] }); toast.success("Duplicated"); navigate({ to: "/admin/products/$id", params: { id } }); },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = products.filter((p) => p.title.toLowerCase().includes(q.toLowerCase()) || p.sku?.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Products</h1>
          <p className="text-muted-foreground mt-1">{products.length} total</p>
        </div>
        <Button asChild><Link to="/admin/products/new"><Plus className="mr-2 h-4 w-4" /> New product</Link></Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search products or SKU" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>

      {isLoading ? (
        <Card className="p-10 text-center text-muted-foreground">Loading…</Card>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground border-dashed">
          {products.length === 0 ? "No products yet. Create your first one." : "No matches."}
        </Card>
      ) : (
        <Card className="divide-y overflow-hidden">
          {filtered.map((p) => {
            const img = p.product_images?.find((i: any) => i.is_primary)?.image_url || p.product_images?.[0]?.image_url;
            return (
              <div key={p.id} className="flex items-center gap-4 p-4 hover:bg-muted/40 transition-colors">
                <div className="h-14 w-14 rounded-md bg-muted overflow-hidden shrink-0">
                  {img && <img src={img} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link to="/admin/products/$id" params={{ id: p.id }} className="font-semibold truncate hover:underline">{p.title}</Link>
                    <Badge variant={p.status === "published" ? "default" : "secondary"}>{p.status}</Badge>
                    {p.is_featured && <Badge variant="outline">Featured</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                    <span>SKU: {p.sku || "—"}</span>
                    <span>Stock: {p.stock_quantity}</span>
                    <span>₦{(p.discount_price ?? p.price).toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" title={p.status === "published" ? "Unpublish" : "Publish"} onClick={() => toggleStatus.mutate({ id: p.id, status: p.status })}>
                    {p.status === "published" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button size="icon" variant="ghost" title="Duplicate" onClick={() => duplicate.mutate(p.id)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" asChild title="Edit">
                    <Link to="/admin/products/$id" params={{ id: p.id }}><Pencil className="h-4 w-4" /></Link>
                  </Button>
                  <Button size="icon" variant="ghost" title="Delete" onClick={() => { if (confirm(`Delete "${p.title}"?`)) remove.mutate(p.id); }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
