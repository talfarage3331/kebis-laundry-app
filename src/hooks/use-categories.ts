import { useEffect, useState } from "react";
import { collection, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface Category {
  id: string;
  label_he: string;
  emoji: string;
  colorClass: string;
}

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "washing", label_he: "כביסה", emoji: "👕", colorClass: "bg-blue-100 text-blue-700" },
  { id: "ironing", label_he: "גיהוץ", emoji: "♨️", colorClass: "bg-amber-100 text-amber-700" },
  { id: "dry_cleaning", label_he: "ניקוי יבש", emoji: "✨", colorClass: "bg-purple-100 text-purple-700" },
  { id: "special", label_he: "שירותים מיוחדים", emoji: "⭐", colorClass: "bg-rose-100 text-rose-700" },
];

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") {
      setLoading(false);
      return;
    }

    const categoriesCollection = collection(db, "categories");

    const unsubscribe = onSnapshot(
      categoriesCollection,
      (snapshot) => {
        let list: Category[] = snapshot.docs.map((docSnap) => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            label_he: d.label_he ?? "",
            emoji: d.emoji ?? "🏷️",
            colorClass: d.colorClass ?? "bg-slate-100 text-slate-700",
          };
        });

        if (list.length === 0) {
          list = DEFAULT_CATEGORIES;
        }

        setCategories(list);
        setLoading(false);
      },
      (err) => {
        console.warn("[useCategories] Firestore failed, using local defaults:", err);
        setCategories(DEFAULT_CATEGORIES);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const addCategory = async (label_he: string, emoji: string = "🏷️") => {
    if (!label_he.trim()) return;
    
    const colors = [
      "bg-blue-100 text-blue-700",
      "bg-amber-100 text-amber-700",
      "bg-purple-100 text-purple-700",
      "bg-rose-100 text-rose-700",
      "bg-cyan-100 text-cyan-700",
      "bg-green-100 text-green-700",
    ];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    await addDoc(collection(db, "categories"), {
      label_he: label_he.trim(),
      emoji: emoji.trim() || "🏷️",
      colorClass: randomColor,
      createdAt: serverTimestamp(),
    });
  };

  return { categories, loading, addCategory };
}
