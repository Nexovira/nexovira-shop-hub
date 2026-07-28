import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Package, CheckCircle2, PenLine, FolderTree, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: DashboardPage,
});

function DashboardPage() {
  const { data: stats } = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: async () => {
      const [all, published, draft, cats] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("status", "published"),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("status", "draft"),
        supabase.from("categories").select("id", { count: "exact", head: true }),
      ]);
      return {
        total: all.count ?? 0, published: published.count ?? 0,
        draft: draft.count ?? 0, categories: cats.count ?? 0,
      };
    },
  });

  const cards = [
    { label: "Total products", value: stats?.total ?? "—", icon: Package, tone: "bg-primary/10 text-primary" },
    { label: "Published", value: stats?.published ?? "—", icon: CheckCircle2, tone: "bg-emerald-500/10 text-emerald-600" },
    { label: "Drafts", value: stats?.draft ?? "—", icon: PenLine, tone: "bg-amber-500/10 text-amber-600" },
    { label: "Categories", value: stats?.categories ?? "—", icon: FolderTree, tone: "bg-blue-500/10 text-blue-600" },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Overview of your store.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label} className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</div>
                <div className="text-3xl font-bold mt-1">{c.value}</div>
              </div>
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${c.tone}`}>
                <c.icon className="h-5 w-5" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Add your first product</h2>
            <p className="text-sm text-muted-foreground mt-1">Publish products so customers can start shopping.</p>
          </div>
          <Button asChild>
            <Link to="/admin/products/new">New product <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
