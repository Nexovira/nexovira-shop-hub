import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { ArrowRight, Truck, ShieldCheck, Headphones, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NEXOVIRA — Premium Electrical Appliances in Nigeria" },
      { name: "description", content: "Shop TVs, kitchen appliances, home & office electricals from trusted brands. Fast delivery across Nigeria." },
      { property: "og:title", content: "NEXOVIRA — Premium Electrical Appliances" },
      { property: "og:description", content: "Shop TVs, kitchen appliances, home & office electricals with nationwide delivery." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { data: products = [] } = useQuery({
    queryKey: ["products", "published"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, title, slug, price, discount_price, short_description, product_images(image_url, is_primary)")
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data;
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden bg-hero text-white">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 30%, oklch(0.78 0.16 70) 0%, transparent 40%)" }} />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
              <Zap className="h-3 w-3 text-accent" /> New arrivals every week
            </div>
            <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.05] tracking-tight">
              Power your home with <span className="text-accent">premium appliances</span>
            </h1>
            <p className="mt-6 text-lg text-white/80 max-w-xl">
              From flagship refrigerators to compact kitchen essentials — NEXOVIRA delivers trusted electrical appliances across Nigeria.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" className="bg-accent-gradient text-primary hover:opacity-90 font-semibold shadow-lifted">
                Shop the collection <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" className="border-white/30 bg-white/5 text-white hover:bg-white/15">
                Browse categories
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Trust bar */}
      <section className="border-b border-border bg-secondary/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-2 md:grid-cols-3 gap-6">
          {[
            { icon: Truck, title: "Nationwide delivery", desc: "Fast, trackable shipping" },
            { icon: ShieldCheck, title: "Genuine products", desc: "Manufacturer-backed warranty" },
            { icon: Headphones, title: "Expert support", desc: "We help you pick right" },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold">{title}</div>
                <div className="text-xs text-muted-foreground">{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Categories */}
      <section id="categories" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Shop by category</h2>
            <p className="mt-2 text-muted-foreground">Find exactly what your space needs.</p>
          </div>
        </div>
        {categories.length === 0 ? (
          <EmptyPanel text="Categories will appear here once your admin adds them." />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {categories.map((c) => (
              <Card key={c.id} className="group overflow-hidden shadow-soft hover:shadow-lifted transition-all cursor-pointer p-6">
                <div className="text-lg font-semibold">{c.name}</div>
                <div className="text-sm text-muted-foreground mt-1 line-clamp-2">{c.description || "Explore this collection"}</div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Featured products */}
      <section id="featured" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-20">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Latest arrivals</h2>
            <p className="mt-2 text-muted-foreground">Fresh in stock this week.</p>
          </div>
        </div>
        {products.length === 0 ? (
          <EmptyPanel text="Products will appear here once your admin publishes them from the dashboard." />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {products.map((p) => {
              const img = p.product_images?.find((i: any) => i.is_primary)?.image_url || p.product_images?.[0]?.image_url;
              return (
                <Card key={p.id} className="overflow-hidden shadow-soft hover:shadow-lifted transition-all group p-0">
                  <div className="aspect-square bg-muted overflow-hidden">
                    {img ? (
                      <img src={img} alt={p.title} className="h-full w-full object-cover group-hover:scale-105 transition-transform" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                        <Zap className="h-8 w-8" />
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold line-clamp-1">{p.title}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{p.short_description}</p>
                    <div className="mt-3 flex items-baseline gap-2">
                      <span className="text-lg font-bold">₦{(p.discount_price ?? p.price).toLocaleString()}</span>
                      {p.discount_price && (
                        <span className="text-xs line-through text-muted-foreground">₦{p.price.toLocaleString()}</span>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <footer className="border-t border-border bg-secondary/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 text-sm text-muted-foreground flex flex-wrap items-center justify-between gap-4">
          <div>© {new Date().getFullYear()} NEXOVIRA Global Ventures. All rights reserved.</div>
          <div>nexovira.name.ng</div>
        </div>
      </footer>
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <Card className="p-10 text-center text-muted-foreground border-dashed">
      {text}
    </Card>
  );
}
