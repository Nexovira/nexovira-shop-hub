import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Zap, Minus, Plus, ArrowLeft, Check } from "lucide-react";
import { useCart, formatNaira } from "@/lib/cart";
import { ShareProduct } from "@/components/product-share";
import { getProductBySlug } from "@/lib/catalog.functions";
import { toast } from "sonner";

function primaryImageOf(images: { image_url: string; is_primary: boolean }[] = []) {
  return images.find((i) => i.is_primary)?.image_url ?? images[0]?.image_url ?? null;
}

export const Route = createFileRoute("/products/$slug")({
  loader: async ({ params }) => {
    const { product, redirectTo } = await getProductBySlug({ data: { slug: params.slug } });
    if (!product && redirectTo) {
      throw redirect({ to: "/products/$slug", params: { slug: redirectTo }, replace: true });
    }
    return { product };
  },
  head: ({ loaderData }) => {
    const p = loaderData?.product;
    if (!p) {
      return {
        meta: [
          { title: "Product unavailable — Nexovira" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const price = Number(p.discount_price ?? p.price);
    const title = `${p.title}${p.brand ? ` — ${p.brand}` : ""} | ₦${price.toLocaleString()}`;
    const description =
      p.short_description ||
      p.description?.slice(0, 155) ||
      `Buy ${p.title} at Nexovira with fast nationwide delivery across Nigeria.`;
    const image = primaryImageOf(p.product_images);
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "product" },
        { property: "product:price:amount", content: String(price) },
        { property: "product:price:currency", content: "NGN" },
        { name: "twitter:card", content: "summary_large_image" },
        ...(image
          ? [
              { property: "og:image", content: image },
              { name: "twitter:image", content: image },
            ]
          : []),
      ],
    };
  },
  errorComponent: () => <ProductMessage title="This product didn't load" body="Please try again in a moment." />,
  notFoundComponent: () => <ProductMessage title="Product not found" body="It may have been removed or is no longer published." />,
  component: ProductDetail,
});

function ProductMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-muted-foreground">{body}</p>
        <Button asChild className="mt-6"><Link to="/">Back to store</Link></Button>
      </div>
    </div>
  );
}

function ProductDetail() {
  const { product: data } = Route.useLoaderData();
  const navigate = useNavigate();
  const { add } = useCart();
  const [qty, setQty] = useState(1);
  const [activeImage, setActiveImage] = useState(0);

  if (!data) {
    return <ProductMessage title="Product not found" body="It may have been removed or is no longer published." />;
  }

  const images = [...(data.product_images || [])].sort(
    (a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0) || a.sort_order - b.sort_order,
  );
  const displayPrice = Number(data.discount_price ?? data.price);
  const inStock = !data.track_inventory || data.stock_quantity > 0;
  const primaryImage = images[activeImage]?.image_url;

  function handleAddToCart() {
    add(
      {
        productId: data!.id,
        slug: data!.slug,
        title: data!.title,
        price: displayPrice,
        imageUrl: primaryImage,
        stock: data!.track_inventory ? data!.stock_quantity : undefined,
      },
      qty,
    );
    toast.success("Added to cart");
  }

  function handleBuyNow() {
    handleAddToCart();
    navigate({ to: "/cart" });
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link to="/"><ArrowLeft className="h-4 w-4 mr-2" />Back</Link>
        </Button>

        <div className="grid lg:grid-cols-2 gap-10">
          <div>
            <Card className="aspect-square overflow-hidden bg-muted p-0">
              {primaryImage ? (
                <img src={primaryImage} alt={images[activeImage]?.alt_text || data.title} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                  <Zap className="h-16 w-16" />
                </div>
              )}
            </Card>
            {images.length > 1 && (
              <div className="mt-3 grid grid-cols-5 gap-2">
                {images.map((img, idx) => (
                  <button key={idx} onClick={() => setActiveImage(idx)}
                    className={`aspect-square overflow-hidden rounded-md border-2 transition-all ${activeImage === idx ? "border-primary" : "border-transparent hover:border-border"}`}>
                    <img src={img.image_url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            {data.categories && (
              <Link
                to="/categories/$slug"
                params={{ slug: data.categories.slug }}
                className="text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
              >
                {data.categories.name}
              </Link>
            )}
            <h1 className="mt-2 text-3xl lg:text-4xl font-bold tracking-tight">{data.title}</h1>
            {data.brand && <div className="mt-1 text-sm text-muted-foreground">by {data.brand}</div>}
            {data.short_description && (
              <p className="mt-3 text-muted-foreground">{data.short_description}</p>
            )}

            <div className="mt-6 flex items-baseline gap-3">
              <span className="text-3xl font-bold">{formatNaira(displayPrice)}</span>
              {data.discount_price && (
                <span className="text-lg line-through text-muted-foreground">{formatNaira(Number(data.price))}</span>
              )}
            </div>

            <div className="mt-4">
              {inStock ? (
                <Badge variant="secondary" className="gap-1"><Check className="h-3 w-3" /> In stock</Badge>
              ) : (
                <Badge variant="destructive">Out of stock</Badge>
              )}
              {data.sku && <span className="ml-3 text-xs text-muted-foreground">SKU: {data.sku}</span>}
            </div>

            {inStock && (
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center rounded-md border border-input">
                  <Button variant="ghost" size="icon" onClick={() => setQty(Math.max(1, qty - 1))}><Minus className="h-4 w-4" /></Button>
                  <span className="w-10 text-center text-sm font-medium">{qty}</span>
                  <Button variant="ghost" size="icon" onClick={() => setQty(qty + 1)}><Plus className="h-4 w-4" /></Button>
                </div>
                <Button onClick={handleAddToCart} size="lg" variant="outline" className="gap-2">
                  <ShoppingCart className="h-4 w-4" /> Add to cart
                </Button>
                <Button onClick={handleBuyNow} size="lg" className="bg-accent-gradient text-primary font-semibold hover:opacity-90">
                  Buy now
                </Button>
              </div>
            )}

            <div className="mt-6">
              <ShareProduct
                title={data.title}
                text={data.short_description || `${formatNaira(displayPrice)} at Nexovira Appliance Store`}
              />
            </div>

            {data.description && (
              <div className="mt-10">
                <h2 className="text-lg font-semibold mb-2">Description</h2>
                <div className="text-sm text-muted-foreground whitespace-pre-line">{data.description}</div>
              </div>
            )}

            {data.specifications && Object.keys(data.specifications).length > 0 && (
              <div className="mt-8">
                <h2 className="text-lg font-semibold mb-3">Specifications</h2>
                <dl className="divide-y divide-border rounded-md border border-border">
                  {Object.entries(data.specifications).map(([k, v]) => (
                    <div key={k} className="grid grid-cols-3 gap-2 px-4 py-2 text-sm">
                      <dt className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</dt>
                      <dd className="col-span-2 font-medium">{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
