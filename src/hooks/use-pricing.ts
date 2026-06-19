/**
 * usePricing — real-time subscription to the Firestore `pricing` collection.
 *
 * Subscribes via `onSnapshot` and properly unsubscribes on cleanup to
 * prevent memory leaks. Safe to use in multiple components simultaneously;
 * each mount gets its own independent listener.
 */

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";

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

export const CATEGORY_META: Record<string, CategoryMeta> = {
  washing: { label_he: "כביסה", colorClass: "bg-blue-100 text-blue-700", emoji: "🫧" },
  ironing: { label_he: "גיהוץ", colorClass: "bg-amber-100 text-amber-700", emoji: "♨️" },
  dry_cleaning: { label_he: "ניקוי יבש", colorClass: "bg-purple-100 text-purple-700", emoji: "✨" },
  bedding: { label_he: "מצעים ומגבות", colorClass: "bg-cyan-100 text-cyan-700", emoji: "🛏️" },
  special: { label_he: "שירותים מיוחדים", colorClass: "bg-rose-100 text-rose-700", emoji: "⭐" },
};

/** Fallback meta for unknown categories */
export function getCategoryMeta(category: string): CategoryMeta {
  return (
    CATEGORY_META[category] ?? {
      label_he: category,
      colorClass: "bg-slate-100 text-slate-700",
      emoji: "🏷️",
    }
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UsePricingResult {
  items: PricingItem[];
  loading: boolean;
  error: string | null;
}

export function usePricing(): UsePricingResult {
  const [items, setItems] = useState<PricingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      setLoading(false);
      return;
    }

    const q = query(collection(db, "pricing"), orderBy("category"), orderBy("name_he"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data: PricingItem[] = snapshot.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            name_he: d.name_he ?? "",
            category: d.category ?? "special",
            price: typeof d.price === "number" ? d.price : Number(d.price) || 0,
            description_he: d.description_he ?? "",
            unit: d.unit ?? "לפריט",
            isAvailable: d.isAvailable !== false, // default true
          };
        });
        setItems(data);
        setLoading(false);
        if (data.length === 0) {
          setError("המחירון ריק, הוסף פריט חדש");
        } else {
          setError(null);
        }
      },
      (err) => {
        console.error("[usePricing] Firestore error:", err);
        setError("שגיאה בטעינת המחירון");
        setLoading(false);
      },
    );

    // Cleanup — unsubscribe when component unmounts
    return () => unsubscribe();
  }, []);

  return { items, loading, error };
}
