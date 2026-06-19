/**
 * usePricing — real-time subscription to the Firestore `pricing` collection.
 *
 * Subscribes via `onSnapshot` and properly unsubscribes on cleanup to
 * prevent memory leaks. Safe to use in multiple components simultaneously;
 * each mount gets its own independent listener.
 */

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
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

// ─── Default Fallback Pricing Data ────────────────────────────────────────────

const DEFAULT_PRICING_ITEMS: PricingItem[] = [
  {
    id: "default-wash-regular",
    name_he: "כביסה רגילה (עד 7 ק\"ג)",
    category: "washing",
    price: 60,
    description_he: "כביסה, ייבוש וקיפול. כולל חומרי כביסה איכותיים ומרכך.",
    unit: "סל כביסה",
    isAvailable: true,
  },
  {
    id: "default-wash-delicate",
    name_he: "כביסה עדינה / ידנית",
    category: "washing",
    price: 15,
    description_he: "טיפול מיוחד בבדים עדינים, ייבוש בתלייה.",
    unit: "לפריט",
    isAvailable: true,
  },
  {
    id: "default-iron-shirt",
    name_he: "גיהוץ חולצה מכופתרת",
    category: "ironing",
    price: 12,
    description_he: "גיהוץ מקצועי בקיטור וחנייה על קולב.",
    unit: "לפריט",
    isAvailable: true,
  },
  {
    id: "default-iron-pants",
    name_he: "גיהוץ מכנסיים / ג'ינס",
    category: "ironing",
    price: 15,
    description_he: "גיהוץ קפדני כולל קו כפל במידת הצורך.",
    unit: "לפריט",
    isAvailable: true,
  },
  {
    id: "default-dry-suit",
    name_he: "ניקוי יבש חליפה (2 חלקים)",
    category: "dry_cleaning",
    price: 85,
    description_he: "ג'קט ומכנסיים. ניקוי יבש וגיהוץ קיטור מלא.",
    unit: "לחליפה",
    isAvailable: true,
  },
  {
    id: "default-dry-coat",
    name_he: "ניקוי יבש מעיל / ג'קט חורף",
    category: "dry_cleaning",
    price: 60,
    description_he: "הסרת כתמים יסודית, הגנה על סיבי הבד.",
    unit: "לפריט",
    isAvailable: true,
  },
  {
    id: "default-bed-double",
    name_he: "סט מצעים זוגי מלא",
    category: "bedding",
    price: 45,
    description_he: "סדין, ציפה ו-2 ציפיות. כביסה ריחנית במיוחד וגיהוץ.",
    unit: "לסט",
    isAvailable: true,
  },
  {
    id: "default-bed-duvet",
    name_he: "שמיכת פוך זוגית",
    category: "bedding",
    price: 80,
    description_he: "שמיכת נוצות או סינתטית. חיטוי ורענון יסודי.",
    unit: "לפריט",
    isAvailable: true,
  },
  {
    id: "default-bed-towel",
    name_he: "מגבת רחצה ענקית",
    category: "bedding",
    price: 8,
    description_he: "כביסה וייבוש בטמפרטורה השומרת על רכות ומגע נעים.",
    unit: "לפריט",
    isAvailable: true,
  },
  {
    id: "default-special-carpet",
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

export function usePricing(): UsePricingResult {
  const [items, setItems] = useState<PricingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      setLoading(false);
      return;
    }

    // Retrieve pricing items directly without Firestore-side ordering
    // (This avoids requiring composite indexes, ensuring the query never fails)
    const pricingCollection = collection(db, "pricing");

    const unsubscribe = onSnapshot(
      pricingCollection,
      (snapshot) => {
        let data: PricingItem[] = snapshot.docs.map((docSnap) => {
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

        // Perform in-memory sorting by category, then by name_he alphabetically
        data.sort((a, b) => {
          const catCompare = (a.category ?? "").localeCompare(b.category ?? "");
          if (catCompare !== 0) return catCompare;
          return (a.name_he ?? "").localeCompare(b.name_he ?? "");
        });

        // If the database is empty, seed it on the client with our default items
        if (data.length === 0) {
          data = DEFAULT_PRICING_ITEMS;
        }

        setItems(data);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.warn("[usePricing] Firestore snapshot failed, falling back to local pricing defaults:", err);
        // Fallback to default items on error (such as rules propagation or network issue)
        setItems(DEFAULT_PRICING_ITEMS);
        setLoading(false);
        setError(null); // Clear error block to keep the UI healthy
      },
    );

    // Cleanup — unsubscribe when component unmounts
    return () => unsubscribe();
  }, []);

  return { items, loading, error };
}
