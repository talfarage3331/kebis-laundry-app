/**
 * PricingView — customer-facing, read-only price list.
 *
 * Consumes `usePricing()` for real-time Firestore updates.
 * Groups items by category, renders a beautiful mobile-first card grid.
 * Designed to be embedded inside a Dialog modal.
 */

import { useMemo } from "react";
import { X, Tag } from "lucide-react";
import { usePricing, resolveCategoryMeta, type PricingItem } from "@/hooks/use-pricing";
import { useCategories, type Category } from "@/hooks/use-categories";
import { useLaundry } from "@/lib/laundry-store";

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-muted/40 rounded-2xl p-4 animate-pulse space-y-2">
      <div className="h-4 bg-muted rounded-full w-3/4" />
      <div className="h-3 bg-muted rounded-full w-1/2" />
      <div className="h-6 bg-muted rounded-full w-1/3 mt-2" />
    </div>
  );
}

// ─── Single price card ────────────────────────────────────────────────────────

function PriceCard({ item, categories }: { item: PricingItem; categories: Category[] }) {
  const meta = resolveCategoryMeta(item.category, categories);
  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-4 shadow-sm transition-all ${
        item.isAvailable
          ? "bg-card border-border hover:shadow-md hover:-translate-y-0.5"
          : "bg-muted/30 border-muted opacity-55"
      }`}
    >
      {/* Availability badge */}
      {!item.isAvailable && (
        <span className="absolute top-2 left-2 text-[10px] font-bold bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
          לא זמין
        </span>
      )}

      {/* Category chip */}
      <span
        className={`self-start text-[10px] font-bold px-2 py-0.5 rounded-full mb-2 ${meta.colorClass}`}
      >
        {meta.emoji} {meta.label_he}
      </span>

      {/* Name */}
      <h3 className="font-black text-sm text-foreground leading-snug">{item.name_he}</h3>

      {/* Description */}
      {item.description_he && (
        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed line-clamp-2">
          {item.description_he}
        </p>
      )}

      {/* Price */}
      <div className="mt-auto pt-3 flex items-baseline gap-1">
        <span
          className="text-xl font-black"
          style={{ color: "var(--primary)" }}
        >
          ₪{item.price % 1 === 0 ? item.price : item.price.toFixed(1)}
        </span>
        <span className="text-[11px] text-muted-foreground font-semibold">{item.unit}</span>
      </div>
    </div>
  );
}

// ─── Category section ─────────────────────────────────────────────────────────

function CategorySection({
  category,
  items,
  categories,
}: {
  category: string;
  items: PricingItem[];
  categories: Category[];
}) {
  const meta = resolveCategoryMeta(category, categories);
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">{meta.emoji}</span>
        <h2 className="font-black text-base text-foreground">{meta.label_he}</h2>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.colorClass}`}
        >
          {items.length} פריטים
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {items.map((item) => (
          <PriceCard key={item.id} item={item} categories={categories} />
        ))}
      </div>
    </section>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface PricingViewProps {
  onClose?: () => void;
}

export function PricingView({ onClose }: PricingViewProps) {
  const { activeTenantId } = useLaundry();
  const { items, loading: pricingLoading, error } = usePricing(activeTenantId ?? null);
  const { categories, loading: categoriesLoading } = useCategories();

  const loading = pricingLoading || categoriesLoading;

  // Group available + unavailable items by category, preserving sort
  const grouped = useMemo(() => {
    const map = new Map<string, PricingItem[]>();
    for (const item of items) {
      if (!map.has(item.category)) map.set(item.category, []);
      map.get(item.category)!.push(item);
    }
    return map;
  }, [items]);

  const isEmpty = !loading && items.length === 0 && !error;

  return (
    <div className="flex flex-col h-full" dir="rtl">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-5 py-4 shrink-0 border-b border-border"
        style={{
          background:
            "linear-gradient(135deg, oklch(0.34 0.13 333) 0%, oklch(0.28 0.1 280) 100%)",
          borderRadius: "inherit inherit 0 0",
        }}
      >
        <div className="flex items-center gap-3">
          <span
            className="size-9 rounded-xl flex items-center justify-center text-primary font-black"
            style={{ background: "oklch(0.92 0.18 125)" }}
          >
            <Tag size={18} strokeWidth={2.5} style={{ color: "oklch(0.25 0.08 320)" }} />
          </span>
          <div>
            <h1 className="font-black text-lg text-white leading-none">מחירון שירותים</h1>
            <p className="text-white/70 text-xs mt-0.5">מחירים מתעדכנים בזמן אמת</p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="סגור מחירון"
            className="size-9 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition active:scale-90"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* ── Body ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-7">
        {/* Loading skeletons */}
        {loading && (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">⚠️</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <div className="text-center py-16">
            <p className="text-5xl mb-3">🏷️</p>
            <p className="font-bold text-foreground">המחירון ריק</p>
            <p className="text-sm text-muted-foreground mt-1">המנהל טרם הוסיף פריטים</p>
          </div>
        )}

        {/* Grouped categories */}
        {!loading &&
          !error &&
          Array.from(grouped.entries()).map(([category, catItems]) => (
            <CategorySection
              key={category}
              category={category}
              items={catItems}
              categories={categories}
            />
          ))}

        {/* Footer note */}
        {!loading && !error && items.length > 0 && (
          <p className="text-center text-[11px] text-muted-foreground pb-2">
            * המחירים כוללים מע״מ ועשויים להשתנות. צור קשר לפרטים נוספים.
          </p>
        )}
      </div>
    </div>
  );
}
