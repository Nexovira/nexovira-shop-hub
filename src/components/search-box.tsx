import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Search, Loader2, X } from "lucide-react";

/** Escapes characters that are meaningful inside a PostgREST `or` filter. */
function safeTerm(term: string) {
  return term.replace(/[%,()*]/g, " ").trim();
}

export function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function SearchBox({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const debounced = useDebounced(term.trim(), 300);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const { data: suggestions = [], isFetching } = useQuery({
    queryKey: ["search-suggest", debounced],
    enabled: debounced.length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const q = safeTerm(debounced);
      if (!q) return [];
      const { data, error } = await supabase
        .from("products")
        .select("id, title, slug, brand, price, discount_price, product_images(image_url, is_primary)")
        .eq("status", "published")
        .or(`title.ilike.%${q}%,brand.ilike.%${q}%,sku.ilike.%${q}%,short_description.ilike.%${q}%`)
        .limit(6);
      if (error) throw error;
      return data;
    },
  });

  function goToResults(value: string) {
    setOpen(false);
    navigate({ to: "/search", search: { q: value || undefined } });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const picked = suggestions[highlight];
      if (picked) {
        setOpen(false);
        navigate({ to: "/products/$slug", params: { slug: picked.slug } });
      } else {
        goToResults(term.trim());
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className={`relative ${className ?? ""}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          goToResults(term.trim());
        }}
        role="search"
      >
        <label htmlFor="site-search" className="sr-only">Search products</label>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="site-search"
          autoFocus={autoFocus}
          value={term}
          placeholder="Search appliances, brands or SKU…"
          className="pl-9 pr-9"
          autoComplete="off"
          onChange={(e) => {
            setTerm(e.target.value);
            setHighlight(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {isFetching ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : term ? (
          <button
            type="button"
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => { setTerm(""); setOpen(false); }}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </form>

      {open && debounced.length >= 2 && (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lifted">
          {suggestions.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              {isFetching ? "Searching…" : "No matching products"}
            </div>
          ) : (
            <ul className="max-h-80 overflow-auto py-1">
              {suggestions.map((s, i) => {
                const imgs = s.product_images ?? [];
                const img = imgs.find((x) => x.is_primary)?.image_url || imgs[0]?.image_url;
                return (
                  <li key={s.id}>
                    <Link
                      to="/products/$slug"
                      params={{ slug: s.slug }}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2 text-sm ${i === highlight ? "bg-accent/20" : "hover:bg-muted"}`}
                    >
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-muted">
                        {img && <img src={img} alt="" className="h-full w-full object-cover" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{s.title}</div>
                        {s.brand && <div className="truncate text-xs text-muted-foreground">{s.brand}</div>}
                      </div>
                      <div className="shrink-0 text-sm font-semibold">
                        ₦{Number(s.discount_price ?? s.price).toLocaleString()}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <button
            type="button"
            onClick={() => goToResults(term.trim())}
            className="w-full border-t border-border px-4 py-2 text-left text-sm font-medium text-primary hover:bg-muted"
          >
            See all results for "{term.trim()}"
          </button>
        </div>
      )}
    </div>
  );
}
