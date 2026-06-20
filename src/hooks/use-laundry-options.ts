import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where, getDocs, doc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ADDONS_META, DELIVERY_TIERS_META } from "@/lib/laundry-store";

export interface CustomAddon {
  id: string;
  key: string;
  laundryId: string;
  label: string;
  price: number;
  group: string;
  desc: string;
}

export interface CustomDeliveryTier {
  id: string;
  key: string;
  laundryId: string;
  label: string;
  price: number;
  desc: string;
}

export function useLaundryOptions() {
  const [customAddons, setCustomAddons] = useState<CustomAddon[]>([]);
  const [customTiers, setCustomDeliveryTiers] = useState<CustomDeliveryTier[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubAddons = onSnapshot(collection(db, "laundry_addons"), (snap) => {
      const list = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          key: data.key || d.id,
          laundryId: data.laundryId || "",
          label: data.label || "",
          price: Number(data.price) || 0,
          group: data.group || "",
          desc: data.desc || "",
        } as CustomAddon;
      });
      setCustomAddons(list);
    });

    const unsubTiers = onSnapshot(collection(db, "laundry_delivery_tiers"), (snap) => {
      const list = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          key: data.key || d.id,
          laundryId: data.laundryId || "",
          label: data.label || "",
          price: Number(data.price) || 0,
          desc: data.desc || "",
        } as CustomDeliveryTier;
      });
      setCustomDeliveryTiers(list);
      setLoading(false);
    });

    return () => {
      unsubAddons();
      unsubTiers();
    };
  }, []);

  const resolveAddon = (key: string, laundryId?: string) => {
    if (laundryId) {
      const found = customAddons.find(a => a.laundryId === laundryId && (a.key === key || a.id === key));
      if (found) return found;
    }
    const foundAny = customAddons.find(a => a.key === key || a.id === key);
    if (foundAny) return foundAny;

    return ADDONS_META[key] || { label: key, price: 0, desc: "", group: "" };
  };

  const resolveTier = (key: string, laundryId?: string) => {
    if (laundryId) {
      const found = customTiers.find(t => t.laundryId === laundryId && (t.key === key || t.id === key));
      if (found) return found;
    }
    const foundAny = customTiers.find(t => t.key === key || t.id === key);
    if (foundAny) return foundAny;

    return DELIVERY_TIERS_META[key] || { label: key, price: 0, desc: "" };
  };

  return { customAddons, customTiers, resolveAddon, resolveTier, loading };
}

export async function seedDefaultsIfEmpty(laundryId: string) {
  if (!laundryId) return;

  // Check addons
  const addonsQuery = query(collection(db, "laundry_addons"), where("laundryId", "==", laundryId));
  const addonsSnap = await getDocs(addonsQuery);
  if (addonsSnap.empty) {
    const batch = writeBatch(db);
    Object.entries(ADDONS_META).forEach(([key, addon]) => {
      const docRef = doc(collection(db, "laundry_addons"));
      batch.set(docRef, {
        key,
        laundryId,
        label: addon.label,
        price: Number(addon.price),
        group: addon.group,
        desc: addon.desc,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });
    await batch.commit();
  }

  // Check delivery tiers
  const tiersQuery = query(collection(db, "laundry_delivery_tiers"), where("laundryId", "==", laundryId));
  const tiersSnap = await getDocs(tiersQuery);
  if (tiersSnap.empty) {
    const batch = writeBatch(db);
    Object.entries(DELIVERY_TIERS_META).forEach(([key, tier]) => {
      const docRef = doc(collection(db, "laundry_delivery_tiers"));
      batch.set(docRef, {
        key,
        laundryId,
        label: tier.label,
        price: Number(tier.price),
        desc: tier.desc,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });
    await batch.commit();
  }
}
