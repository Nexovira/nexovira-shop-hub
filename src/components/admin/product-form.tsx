import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, X, Star } from "lucide-react";
import { toast } from "sonner";
import { slugify, uploadProductImage } from "@/lib/storage";
import { useNavigate } from "@tanstack/react-router";

export interface ProductImage { id?: string; image_url: string; is_primary: boolean; sort_order: number; }
export interface ProductFormValues {
  title: string; slug: string; description: string; short_description: string;
  category_id: string | null; price: string; discount_price: string; sku: string; brand: string;
  stock_quantity: string; track_inventory: boolean; is_digital: boolean;
  digital_file_url: string; status: "draft" | "published"; is_featured: boolean;
  weight_kg: string; specifications: string; images: ProductImage[];
}

const empty: ProductFormValues = {
  title: "", slug: "", description: "", short_description: "",
  category_id: null, price: "", discount_price: "", sku: "", brand: "",
  stock_quantity: "0", track_inventory: true, is_digital: false, digital_file_url: "",
  status: "draft", is_featured: false, weight_kg: "", specifications: "{}", images: [],
};


export function ProductForm({ productId }: { productId?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [v, setV] = useState<ProductFormValues>(empty);
  const [uploading, setUploading] = useState(false);
  const [slugTouched, setSlugTouched] = useState(!!productId);

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await supabase.from("categories").select("id, name").order("name")).data ?? [],
  });

  const { data: existing } = useQuery({
    queryKey: ["admin", "product", productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data: p, error } = await supabase.from("products").select("*, product_images(*)").eq("id", productId!).single();
      if (error) throw error;
      return p;
    },
  });

  useEffect(() => {
    if (!existing) return;
    setV({
      title: existing.title ?? "", slug: existing.slug ?? "",
      description: existing.description ?? "", short_description: existing.short_description ?? "",
      category_id: existing.category_id, price: String(existing.price ?? ""),
      discount_price: existing.discount_price != null ? String(existing.discount_price) : "",
      sku: existing.sku ?? "", stock_quantity: String(existing.stock_quantity ?? 0),
      track_inventory: existing.track_inventory, is_digital: existing.is_digital,
      digital_file_url: existing.digital_file_url ?? "", status: existing.status,
      is_featured: existing.is_featured, weight_kg: existing.weight_kg != null ? String(existing.weight_kg) : "",
      specifications: JSON.stringify(existing.specifications ?? {}, null, 2),
      images: (existing.product_images ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order).map((i: any) => ({
        id: i.id, image_url: i.image_url, is_primary: i.is_primary, sort_order: i.sort_order,
      })),
    });
  }, [existing]);

  useEffect(() => {
    if (!slugTouched && v.title) setV((s) => ({ ...s, slug: slugify(v.title) }));
  }, [v.title, slugTouched]);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(Array.from(files).map((f) => uploadProductImage(f)));
      setV((s) => {
        const images = [...s.images];
        uploaded.forEach((u, i) => images.push({
          image_url: u.url, is_primary: images.length === 0 && i === 0, sort_order: images.length,
        }));
        return { ...s, images };
      });
      toast.success(`Uploaded ${uploaded.length} image${uploaded.length > 1 ? "s" : ""}`);
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally { setUploading(false); }
  }

  function setPrimary(idx: number) {
    setV((s) => ({ ...s, images: s.images.map((im, i) => ({ ...im, is_primary: i === idx })) }));
  }
  function removeImage(idx: number) {
    setV((s) => {
      const images = s.images.filter((_, i) => i !== idx);
      if (!images.some((im) => im.is_primary) && images[0]) images[0].is_primary = true;
      return { ...s, images };
    });
  }

  const save = useMutation({
    mutationFn: async () => {
      // Validate JSON specs
      let specs: any = {};
      try { specs = v.specifications.trim() ? JSON.parse(v.specifications) : {}; }
      catch { throw new Error("Specifications must be valid JSON"); }

      const payload = {
        title: v.title.trim(), slug: (v.slug || slugify(v.title)).trim(),
        description: v.description || null, short_description: v.short_description || null,
        category_id: v.category_id || null, price: Number(v.price),
        discount_price: v.discount_price ? Number(v.discount_price) : null,
        sku: v.sku || null, stock_quantity: Number(v.stock_quantity) || 0,
        track_inventory: v.track_inventory, is_digital: v.is_digital,
        digital_file_url: v.is_digital && v.digital_file_url ? v.digital_file_url : null,
        status: v.status, is_featured: v.is_featured,
        weight_kg: v.weight_kg ? Number(v.weight_kg) : null,
        specifications: specs,
      };

      let id = productId;
      if (id) {
        const { error } = await supabase.from("products").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { data: userData } = await supabase.auth.getUser();
        const { data, error } = await supabase.from("products").insert({ ...payload, created_by: userData.user?.id }).select("id").single();
        if (error) throw error;
        id = data.id;
      }

      // Replace images: delete missing, upsert current
      const existingIds = new Set((existing?.product_images ?? []).map((i: any) => i.id));
      const keepIds = new Set(v.images.filter((i) => i.id).map((i) => i.id!));
      const toDelete = [...existingIds].filter((eid) => !keepIds.has(eid as string));
      if (toDelete.length) await supabase.from("product_images").delete().in("id", toDelete);

      for (let i = 0; i < v.images.length; i++) {
        const im = v.images[i];
        const row = { product_id: id!, image_url: im.image_url, is_primary: im.is_primary, sort_order: i };
        if (im.id) await supabase.from("product_images").update(row).eq("id", im.id);
        else await supabase.from("product_images").insert(row);
      }
      return id!;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success(productId ? "Product saved" : "Product created");
      if (!productId) navigate({ to: "/admin/products/$id", params: { id } });
    },
    onError: (e: any) => toast.error(e.message || "Save failed"),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{productId ? "Edit product" : "New product"}</h1>
          <Badge variant={v.status === "published" ? "default" : "secondary"} className="mt-2">{v.status}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => navigate({ to: "/admin/products" })}>Cancel</Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card className="p-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input id="title" required value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">URL slug</Label>
              <Input id="slug" value={v.slug} onChange={(e) => { setSlugTouched(true); setV({ ...v, slug: e.target.value }); }} placeholder="auto-generated from title" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="short">Short description</Label>
              <Textarea id="short" rows={2} value={v.short_description} onChange={(e) => setV({ ...v, short_description: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc">Full description</Label>
              <Textarea id="desc" rows={6} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
            </div>
          </Card>

          <Card className="p-6 space-y-4">
            <h2 className="font-semibold">Images</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {v.images.map((im, i) => (
                <div key={i} className="group relative aspect-square rounded-md overflow-hidden bg-muted">
                  <img src={im.image_url} alt="" className="h-full w-full object-cover" />
                  {im.is_primary && (
                    <Badge className="absolute top-1 left-1 bg-accent text-accent-foreground">Primary</Badge>
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                    <Button size="icon" variant="secondary" type="button" onClick={() => setPrimary(i)} title="Set primary"><Star className="h-4 w-4" /></Button>
                    <Button size="icon" variant="destructive" type="button" onClick={() => removeImage(i)} title="Remove"><X className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
              <label className="aspect-square rounded-md border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-muted/50 transition-colors">
                {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6 text-muted-foreground" />}
                <span className="text-xs text-muted-foreground">Upload</span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />
              </label>
            </div>
          </Card>

          <Card className="p-6 space-y-4">
            <h2 className="font-semibold">Specifications (JSON)</h2>
            <Textarea rows={6} value={v.specifications} onChange={(e) => setV({ ...v, specifications: e.target.value })}
              placeholder='{"Power": "1500W", "Voltage": "220V", "Warranty": "2 years"}' className="font-mono text-xs" />
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6 space-y-4">
            <h2 className="font-semibold">Status</h2>
            <Select value={v.status} onValueChange={(x: "draft" | "published") => setV({ ...v, status: x })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center justify-between">
              <Label htmlFor="featured">Featured</Label>
              <Switch id="featured" checked={v.is_featured} onCheckedChange={(c) => setV({ ...v, is_featured: c })} />
            </div>
          </Card>

          <Card className="p-6 space-y-4">
            <h2 className="font-semibold">Pricing</h2>
            <div className="space-y-2">
              <Label htmlFor="price">Price (₦) *</Label>
              <Input id="price" type="number" step="0.01" min="0" required value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="discount">Discount price (₦)</Label>
              <Input id="discount" type="number" step="0.01" min="0" value={v.discount_price} onChange={(e) => setV({ ...v, discount_price: e.target.value })} />
            </div>
          </Card>

          <Card className="p-6 space-y-4">
            <h2 className="font-semibold">Inventory</h2>
            <div className="space-y-2">
              <Label htmlFor="sku">SKU</Label>
              <Input id="sku" value={v.sku} onChange={(e) => setV({ ...v, sku: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stock">Stock quantity</Label>
              <Input id="stock" type="number" min="0" value={v.stock_quantity} onChange={(e) => setV({ ...v, stock_quantity: e.target.value })} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="track">Track inventory</Label>
              <Switch id="track" checked={v.track_inventory} onCheckedChange={(c) => setV({ ...v, track_inventory: c })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="weight">Weight (kg)</Label>
              <Input id="weight" type="number" step="0.001" min="0" value={v.weight_kg} onChange={(e) => setV({ ...v, weight_kg: e.target.value })} />
            </div>
          </Card>

          <Card className="p-6 space-y-4">
            <h2 className="font-semibold">Category</h2>
            <Select value={v.category_id ?? "none"} onValueChange={(x) => setV({ ...v, category_id: x === "none" ? null : x })}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Uncategorized</SelectItem>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Card>

          <Card className="p-6 space-y-4">
            <h2 className="font-semibold">Digital download</h2>
            <div className="flex items-center justify-between">
              <Label htmlFor="digital">Digital product</Label>
              <Switch id="digital" checked={v.is_digital} onCheckedChange={(c) => setV({ ...v, is_digital: c })} />
            </div>
            {v.is_digital && (
              <div className="space-y-2">
                <Label htmlFor="dfile">Download URL</Label>
                <Input id="dfile" value={v.digital_file_url} onChange={(e) => setV({ ...v, digital_file_url: e.target.value })} placeholder="https://…" />
              </div>
            )}
          </Card>
        </div>
      </div>
    </form>
  );
}
