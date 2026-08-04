import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Zap } from "lucide-react";

export type ProductCardData = {
  id: string;
  title: string;
  slug: string;
  price: number;
  discount_price: number | null;
  short_description?: string | null;
  brand?: string | null;
  product_images?: { image_url: string; is_primary: boolean }[] | null;
};

export function ProductCard({ product }: { product: ProductCardData }) {
  const images = product.product_images ?? [];
  const img = images.find((i) => i.is_primary)?.image_url || images[0]?.image_url;
  return (
    <Link to="/products/$slug" params={{ slug: product.slug }}>
      <Card className="overflow-hidden shadow-soft hover:shadow-lifted transition-all group p-0 h-full">
        <div className="aspect-square bg-muted overflow-hidden">
          {img ? (
            <img src={img} alt={product.title} loading="lazy" className="h-full w-full object-cover group-hover:scale-105 transition-transform" />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-muted-foreground">
              <Zap className="h-8 w-8" />
            </div>
          )}
        </div>
        <div className="p-4">
          {product.brand && (
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{product.brand}</div>
          )}
          <h3 className="font-semibold line-clamp-1">{product.title}</h3>
          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{product.short_description}</p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-lg font-bold">₦{Number(product.discount_price ?? product.price).toLocaleString()}</span>
            {product.discount_price && (
              <span className="text-xs line-through text-muted-foreground">₦{Number(product.price).toLocaleString()}</span>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}
