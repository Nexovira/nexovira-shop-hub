import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { SearchBox, useDebounced } from "@/components/search-box";
import { ProductCard } from "@/components/product-card";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SearchParams = {
  q?: string;
  category?: string;
  brand?: string;
  min?: number;
  max?: number;
  sort?: "newest" | "price_asc" | "price_desc";
};

export const Route = createFileRoute("/search")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    q: typeof search.q === "string" && search.q ? search.q.slice(0, 100) : undefined,
    category: typeof search.category === "string" && search.category ? search.category : undefined,
    brand: typeof search.brand === "string" && search.brand ? search.brand : undefined,
    min: Number.isFinite(Number(search.min)) && search.min !== undefined && search.min !== "" ? Number(search.min) : undefined,
    max: Number.isFinite(Number(search.max)) && search.max !== undefined && search.max !== "" ? Number(search.max) : undefined,
    sort:
      search.sort === "price_asc" || search.sort === "price_desc" || search.sort === "newest"
        ? search.sort
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Search appliances — Nexovira Appliance Store" },
      { name: "description", content: "Search Nexovira for TVs, refrigerators, kitchen and home appliances by brand, price or SKU." },
      { property: "og:title", content: "Search appliances — Nexovira Appliance Store" },
      { property: "og:description", content: "Find the right appliance fast: filter by brand, category and price." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SearchPage,
});

function safeTerm(term: string) {
  return term.replace(/[%,()*]/g, " ").trim();
}

function SearchPage() {
  const params = Route.useSearch();
  const navigate = Route.useNavigate();

  const [minInput, setMinInput] = useState(params.min?.toString() ?? "");
  const [maxInput, setMaxInput] = useState(params.max?.toString() ?? "");
  const debouncedMin = useDebounced(minInput, 400);
  const debouncedMax = useDebounced(maxInput, 400);

  useEffect(() => {
    navigate({
      search: (prev) => ({
        ...prev,
        min: debouncedMin === "" ? undefined : Number(debouncedMin),
        max: debouncedMax === "" ? undefined : Number(debouncedMax),
      }),
      replace: true,
    });
  }, [debouncedMin, debouncedMax, navigate]);

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id, name, slug").order("sort_order");
      if (error) throw error;
      return data;
    },
    staleTime: 300_000,
  });

  const { data: brands = [] } = useQuery({
    queryKey: ["brands"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("brand")
        .eq("status", "published")
        .not("brand", "is", null);
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((r) => r.brand).filter(Boolean) as string[])).sort();
    },
    staleTime: 300_000,
  });

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["search", params],
    queryFn: async () => {
      let query = supabase
        .from("products")
        .select("id, title, slug, brand, price, discount_price, short_description, category_id, created_at, product_images(image_url, is_primary)")
        .eq("status", "published");

      const q = params.q ? safeTerm(params.q) : "";
      if (q) query = query.or(`title.ilike.%${q}%,brand.ilike.%${q}%,sku.ilike.%${q}%,short_description.ilike.%${q}%,description.ilike.%${q}%`);
      if (params.brand) query = query.eq("brand", params.brand);
      if (params.category) {
        const cat = categories.find((c) => c.slug === params.category);
        if (cat) query = query.eq("category_id", cat.id);
      }
      if (params.min !== undefined) query = query.gte("price", params.min);
      if (params.max !== undefined) query = query.lte("price", params.max);

      if (params.sort === "price_asc") query = query.order("price", { ascending: true });
      else if (params.sort === "price_desc") query = query.order("price", { ascending: false });
      else query = query.order("created_at", { ascending: false });

      const { data, error } = await query.limit(100);
      if (error) throw error;
      return data;
    },
    enabled: !params.category || categories.length > 0,
  });

  function setParam(key: keyof SearchParams, value: string | undefined) {
    navigate({ search: (prev) => ({ ...prev, [key]: value || undefined }), replace: true });
  }

  const hasFilters = !!(params.category || params.brand || params.min !== undefined || params.max !== undefined || params.sort);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold tracking-tight">
          {params.q ? `Results for "${params.q}"` : "Browse all appliances"}
        </h1>

        <div className="mt-6 lg:hidden">
          <SearchBox />
        </div>

        <div className="mt-6 grid gap-8 lg:grid-cols-[260px_1fr]">
          <aside className="space-y-5">
            <Card className="p-4 space-y-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={params.category ?? "all"} onValueChange={(v) => setParam("category", v === "all" ? undefined : v)}>
                  <SelectTrigger><SelectValue placeholder="All categories" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.slug}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Brand</Label>
                <Select value={params.brand ?? "all"} onValueChange={(v) => setParam("brand", v === "all" ? undefined : v)}>
                  <SelectTrigger><SelectValue placeholder="All brands" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All brands</SelectItem>
                    {brands.map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Price range (₦)</Label>
                <div className="flex items-center gap-2">
                  <Input inputMode="numeric" placeholder="Min" value={minInput} onChange={(e) => setMinInput(e.target.value.replace(/\D/g, ""))} />
                  <span className="text-muted-foreground">–</span>
                  <Input inputMode="numeric" placeholder="Max" value={maxInput} onChange={(e) => setMaxInput(e.target.value.replace(/\D/g, ""))} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Sort by</Label>
                <Select value={params.sort ?? "newest"} onValueChange={(v) => setParam("sort", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="price_asc">Price: low to high</SelectItem>
                    <SelectItem value="price_desc">Price: high to low</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {hasFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setMinInput("");
                    setMaxInput("");
                    navigate({ search: { q: params.q }, replace: true });
                  }}
                >
                  Clear filters
                </Button>
              )}
            </Card>
          </aside>

          <div>
            <div className="mb-4 text-sm text-muted-foreground">
              {isFetching ? "Searching…" : `${results.length} product${results.length === 1 ? "" : "s"}`}
            </div>
            {results.length === 0 && !isFetching ? (
              <Card className="border-dashed p-12 text-center text-muted-foreground">
                No products match your search.{" "}
                <Link to="/" className="text-primary underline">Back to the store</Link>
              </Card>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                {results.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
