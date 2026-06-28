/**
 * usePricing — real-time subscription to a laundry's independent pricing subcollection.
 *
 * Queries `/laundries/{laundryId}/pricing` exclusively.
 * Returns an empty array immediately when no laundryId is provided.
 * No global defaults, no fallback merging, no cross-vendor logic.
 */

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { type Category } from "./use-categories";

// ─── Firestore schema ─────────────────────────────────────────────────────────

export interface PricingItem {
  id: string;
  /** Hebrew display name */
  name_he: string;
  /** Category key — used for grouping (e.g. "washing", "ironing", "dry_cleaning") */
  category: string;
  /** Price in NIS */
  price: number;
  /** Hebrew description */
  description_he: string;
  /** Unit label shown next to price (e.g. "לפריט", "לק\"ג", "לחליפה") */
  unit: string;
  /** Whether this item appears in the customer-facing price list */
  isAvailable: boolean;
}

// ─── Category metadata ────────────────────────────────────────────────────────

export interface CategoryMeta {
  label_he: string;
  /** Tailwind colour classes for the category badge */
  colorClass: string;
  /** Emoji icon */
  emoji: string;
}

export const STATIC_CATEGORY_META: Record<string, CategoryMeta> = {
  washing:     { label_he: "כביסה",           colorClass: "bg-blue-100 text-blue-700",    emoji: "👕" },
  ironing:     { label_he: "גיהוץ",           colorClass: "bg-amber-100 text-amber-700",  emoji: "♨️" },
  dry_cleaning:{ label_he: "ניקוי יבש",       colorClass: "bg-purple-100 text-purple-700",emoji: "✨" },
  special:     { label_he: "שירותים מיוחדים", colorClass: "bg-rose-100 text-rose-700",    emoji: "⭐" },
};

export const CATEGORY_META = STATIC_CATEGORY_META;

/** Dynamic and fallback resolver for category metadata */
export function resolveCategoryMeta(categoryKey: string, categories: Category[]): CategoryMeta {
  const found = categories.find((c) => c.id === categoryKey || c.label_he === categoryKey);
  if (found) {
    return {
      label_he: found.label_he,
      emoji: found.emoji,
      colorClass: found.colorClass,
    };
  }

  return (
    STATIC_CATEGORY_META[categoryKey] ?? {
      label_he: categoryKey,
      colorClass: "bg-slate-100 text-slate-700",
      emoji: "🏷️",
    }
  );
}

/** Fallback meta for unknown categories */
export function getCategoryMeta(category: string): CategoryMeta {
  return (
    STATIC_CATEGORY_META[category] ?? {
      label_he: category,
      colorClass: "bg-slate-100 text-slate-700",
      emoji: "🏷️",
    }
  );
}

// ─── Baseline catalog seeded into each laundry ───────────────────────────────

export const BASELINE_PRICING_ITEMS: Omit<PricingItem, "id">[] = [
  {
    name_he: "כביסה רגילה (עד 7 ק\"ג)",
    category: "washing",
    price: 60,
    description_he: "כביסה, ייבוש וקיפול. כולל חומרי כביסה איכותיים ומרכך.",
    unit: "סל כביסה",
    isAvailable: true,
  },
  {
    name_he: "כביסה עדינה / ידנית",
    category: "washing",
    price: 15,
    description_he: "טיפול מיוחד בבדים עדינים, ייבוש בתלייה.",
    unit: "לפריט",
    isAvailable: true,
  },
  {
    name_he: "גיהוץ חולצה מכופתרת",
    category: "ironing",
    price: 12,
    description_he: "גיהוץ מקצועי בקיטור וחנייה על קולב.",
    unit: "לפריט",
    isAvailable: true,
  },
  {
    name_he: "גיהוץ מכנסיים / ג'ינס",
    category: "ironing",
    price: 15,
    description_he: "גיהוץ קפדני כולל קו כפל במידת הצורך.",
    unit: "לפריט",
    isAvailable: true,
  },
  {
    name_he: "ניקוי יבש חליפה (2 חלקים)",
    category: "dry_cleaning",
    price: 85,
    description_he: "ג'קט ומכנסיים. ניקוי יבש וגיהוץ קיטור מלא.",
    unit: "לחליפה",
    isAvailable: true,
  },
  {
    name_he: "ניקוי יבש מעיל / ג'קט חורף",
    category: "dry_cleaning",
    price: 60,
    description_he: "הסרת כתמים יסודית, הגנה על סיבי הבד.",
    unit: "לפריט",
    isAvailable: true,
  },
  {
    name_he: "סט מצעים זוגי מלא",
    category: "washing",
    price: 45,
    description_he: "סדין, ציפה ו-2 ציפיות. כביסה ריחנית במיוחד וגיהוץ.",
    unit: "לסט",
    isAvailable: true,
  },
  {
    name_he: "שמיכת פוך זוגית",
    category: "washing",
    price: 80,
    description_he: "שמיכת נוצות או סינתטית. חיטוי ורענון יסודי.",
    unit: "לפריט",
    isAvailable: true,
  },
  {
    name_he: "מגבת רחצה ענקית",
    category: "washing",
    price: 8,
    description_he: "כביסה וייבוש בטמפרטורה השומרת על רכות ומגע נעים.",
    unit: "לפריט",
    isAvailable: true,
  },
  {
    name_he: "ניקוי שטיח (למ\"ר)",
    category: "special",
    price: 55,
    description_he: "שטיפת עומק, ניטרול ריחות והסרת כתמים קשים.",
    unit: "למ\"ר",
    isAvailable: true,
  },
];

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UsePricingResult {
  items: PricingItem[];
  loading: boolean;
  error: string | null;
}

/**
 * Subscribes in real-time to `/laundries/{laundryId}/pricing`.
 * Returns empty immediately when laundryId is null/undefined.
 */
export function usePricing(laundryId?: string | null): UsePricingResult {
  const [items, setItems] = useState<PricingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!laundryId) {
      setItems([]);
      setLoading(false);
      setError(null);
      return;
    }

    if (typeof window === "undefined") {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const pricingCol = collection(db, "laundries", laundryId, "pricing");

    const unsub = onSnapshot(
      pricingCol,
      (snapshot) => {
        const data: PricingItem[] = snapshot.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            name_he:        d.name_he        ?? "",
            category:       d.category       ?? "special",
            price:          typeof d.price === "number" ? d.price : Number(d.price) || 0,
            description_he: d.description_he ?? "",
            unit:           d.unit           ?? "לפריט",
            isAvailable:    d.isAvailable !== false,
          };
        });

        data.sort((a, b) => {
          const catCompare = (a.category ?? "").localeCompare(b.category ?? "");
          if (catCompare !== 0) return catCompare;
          return (a.name_he ?? "").localeCompare(b.name_he ?? "");
        });

        setItems(data);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("[usePricing] snapshot error:", err);
        setItems([]);
        setLoading(false);
        setError("שגיאה בטעינת המחירון");
      },
    );

    return () => unsub();
  }, [laundryId]);

  return { items, loading, error };
}
