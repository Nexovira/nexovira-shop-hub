import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Loader2, ImagePlus, X, ImageIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { slugify, uploadCategoryImage, deleteCategoryImage } from "@/lib/storage";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin/categories")({
  component: CategoriesPage,
});

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function CategoriesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const newFileRef = useRef<HTMLInputElement>(null);

  const { data: cats = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await supabase.from("categories").select("*").order("sort_order")).data ?? [],
  });

  async function pickImage(file: File | undefined | null): Promise<string | null> {
    if (!file) return null;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return null;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Image must be 5MB or smaller");
      return null;
    }
    setUploading(true);
    try {
      const { url } = await uploadCategoryImage(file);
      return url;
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
      return null;
    } finally {
      setUploading(false);
    }
  }

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name required");
      const { error } = await supabase.from("categories").insert({
        name: name.trim(),
        slug: slugify(name),
        description: description || null,
        image_url: imageUrl,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      setName(""); setDescription(""); setImageUrl(null); setOpen(false);
      toast.success("Category created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const setCategoryImage = useMutation({
    mutationFn: async ({ id, url, previous }: { id: string; url: string | null; previous: string | null }) => {
      const { error } = await supabase.from("categories").update({ image_url: url }).eq("id", id);
      if (error) throw error;
      if (previous && previous !== url) await deleteCategoryImage(previous);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      toast.success("Category image updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (cat: { id: string; image_url?: string | null }) => {
      const { error } = await supabase.from("categories").delete().eq("id", cat.id);
      if (error) throw error;
      if (cat.image_url) await deleteCategoryImage(cat.image_url);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["categories"] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Categories</h1>
          <p className="text-muted-foreground mt-1">Organize your product catalog.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-2 h-4 w-4" /> New category</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New category</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cname">Name</Label>
                <Input id="cname" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Refrigerators" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cdesc">Description</Label>
                <Textarea id="cdesc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Image</Label>
                <div className="flex items-center gap-3">
                  <div className="h-16 w-16 rounded-lg border border-border bg-muted/40 overflow-hidden flex items-center justify-center shrink-0">
                    {imageUrl
                      ? <img src={imageUrl} alt="Category preview" className="h-full w-full object-cover" />
                      : <ImageIcon className="h-5 w-5 text-muted-foreground" />}
                  </div>
                  <input
                    ref={newFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const url = await pickImage(e.target.files?.[0]);
                      if (url) setImageUrl(url);
                      e.target.value = "";
                    }}
                  />
                  <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => newFileRef.current?.click()}>
                    {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
                    {imageUrl ? "Replace" : "Upload"}
                  </Button>
                  {imageUrl && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setImageUrl(null)}>
                      <X className="mr-1 h-4 w-4" /> Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => create.mutate()} disabled={create.isPending || uploading}>
                {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {cats.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground border-dashed">No categories yet.</Card>
      ) : (
        <Card className="divide-y overflow-hidden">
          {cats.map((c: any) => (
            <CategoryRow
              key={c.id}
              category={c}
              busy={uploading || setCategoryImage.isPending}
              onUpload={async (file) => {
                const url = await pickImage(file);
                if (url) setCategoryImage.mutate({ id: c.id, url, previous: c.image_url ?? null });
              }}
              onClearImage={() => setCategoryImage.mutate({ id: c.id, url: null, previous: c.image_url ?? null })}
              onDelete={() => { if (confirm(`Delete "${c.name}"?`)) remove.mutate(c); }}
            />
          ))}
        </Card>
      )}
    </div>
  );
}

function CategoryRow({
  category, busy, onUpload, onClearImage, onDelete,
}: {
  category: any;
  busy: boolean;
  onUpload: (file: File | undefined) => void;
  onClearImage: () => void;
  onDelete: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-4 p-4">
      <div className="h-14 w-14 rounded-lg border border-border bg-muted/40 overflow-hidden flex items-center justify-center shrink-0">
        {category.image_url
          ? <img src={category.image_url} alt={category.name} className="h-full w-full object-cover" loading="lazy" />
          : <ImageIcon className="h-5 w-5 text-muted-foreground" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold">{category.name}</div>
        <div className="text-xs text-muted-foreground truncate">
          /{category.slug}{category.description ? ` — ${category.description}` : ""}
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { onUpload(e.target.files?.[0]); e.target.value = ""; }}
      />
      <Button size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
        {category.image_url ? "Replace" : "Upload"}
      </Button>
      {category.image_url && (
        <Button size="icon" variant="ghost" title="Remove image" disabled={busy} onClick={onClearImage}>
          <X className="h-4 w-4" />
        </Button>
      )}
      <Button size="icon" variant="ghost" onClick={onDelete}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}
