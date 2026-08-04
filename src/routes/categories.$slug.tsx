import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { ProductCard } from "@/components/product-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/categories/$slug")({
  head: ({ params }) => {
    const pretty = params.slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const title = `${pretty} — Nexovira Appliance Store`;
    const description = `Shop ${pretty.toLowerCase()} at Nexovira. Genuine appliances, warranty backed, delivered nationwide across Nigeria.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: CategoryPage,
});

function CategoryPage() {
  const { slug } = Route.useParams();

  const { data: category, isLoading: loadingCategory } = useQuery({
    queryKey: ["category", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, slug, description, image_url")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: products = [], isFetching } = useQuery({
    queryKey: ["category-products", category?.id],
    enabled: !!category?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, title, slug, brand, price, discount_price, short_description, product_images(image_url, is_primary)")
        .eq("status", "published")
        .eq("category_id", category!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  if (!loadingCategory && !category) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto max-w-2xl px-4 py-24 text-center">
          <h1 className="text-2xl font-bold">Category not found</h1>
          <Button asChild className="mt-6"><Link to="/">Back to store</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <section className="relative overflow-hidden bg-hero text-white">
        {category?.image_url && (
          <>
            <img src={category.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-primary/95 via-primary/80 to-primary/40" />
          </>
        )}
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14">
          <Button asChild variant="ghost" size="sm" className="mb-4 text-white hover:bg-white/10">
            <Link to="/"><ArrowLeft className="h-4 w-4 mr-2" />All categories</Link>
          </Button>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{category?.name ?? "Loading…"}</h1>
          {category?.description && <p className="mt-3 max-w-2xl text-white/80">{category.description}</p>}
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-6 text-sm text-muted-foreground">
          {isFetching ? "Loading products…" : `${products.length} product${products.length === 1 ? "" : "s"}`}
        </div>
        {products.length === 0 && !isFetching ? (
          <Card className="border-dashed p-12 text-center text-muted-foreground">
            No products in this category yet.
          </Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {products.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </div>
    </div>
  );
}
