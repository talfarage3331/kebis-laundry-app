import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where, getDocs, doc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useLaundry, ADDONS_META, DELIVERY_TIERS_META } from "@/lib/laundry-store";

export interface CustomAddon {
  id: string;
  key: string;
  laundryId: string;
  label: string;
  price: number;
  group: string;
  desc: string;
  /** Whether this addon is shown to customers during ordering */
  isActive: boolean;
}

export interface CustomDeliveryTier {
  id: string;
  key: string;
  laundryId: string;
  label: string;
  price: number;
  desc: string;
  /** Whether this delivery option is shown to customers during ordering */
  isActive: boolean;
}

export function useLaundryOptions(laundryId?: string | null) {
  const { user, role } = useLaundry();
  const [customAddons, setCustomAddons] = useState<CustomAddon[]>([]);
  const [customTiers, setCustomDeliveryTiers] = useState<CustomDeliveryTier[]>([]);
  const [fastDeliveryEnabled, setFastDeliveryEnabled] = useState(true);
  const [expressDeliveryEnabled, setExpressDeliveryEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let effectiveLaundryId = laundryId;
    if (!effectiveLaundryId && user) {
      if (role === "laundry") {
        effectiveLaundryId = user.uid;
      } else if (role === "customer" && user.assignedLaundryId) {
        effectiveLaundryId = user.assignedLaundryId;
      }
    }

    if (!effectiveLaundryId && role !== "admin") {
      setCustomAddons([]);
      setCustomDeliveryTiers([]);
      setLoading(false);
      return;
    }

    const addonsRef = collection(db, "laundry_addons");
    const addonsQuery = effectiveLaundryId
      ? query(addonsRef, where("laundryId", "==", effectiveLaundryId))
      : addonsRef;

    const unsubAddons = onSnapshot(
      addonsQuery,
      (snap) => {
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
            isActive: data.isActive !== false,
          } as CustomAddon;
        });
        setCustomAddons(list);
      },
      (err) => {
        console.warn("[useLaundryOptions] addons listener failed:", err);
      }
    );

    const tiersRef = collection(db, "laundry_delivery_tiers");
    const tiersQuery = effectiveLaundryId
      ? query(tiersRef, where("laundryId", "==", effectiveLaundryId))
      : tiersRef;

    const unsubTiers = onSnapshot(
      tiersQuery,
      (snap) => {
        const list = snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            key: data.key || d.id,
            laundryId: data.laundryId || "",
            label: data.label || "",
            price: Number(data.price) || 0,
            desc: data.desc || "",
            isActive: data.isActive !== false,
          } as CustomDeliveryTier;
        });
        setCustomDeliveryTiers(list);
        setLoading(false);
      },
      (err) => {
        console.warn("[useLaundryOptions] tiers listener failed:", err);
      }
    );

    let unsubVendor: (() => void) | undefined;
    if (effectiveLaundryId) {
      unsubVendor = onSnapshot(
        doc(db, "users", effectiveLaundryId),
        (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setFastDeliveryEnabled(data.fastDeliveryEnabled ?? true);
            setExpressDeliveryEnabled(data.expressDeliveryEnabled ?? true);
          }
        },
        (err) => console.warn("[useLaundryOptions] vendor listener failed:", err)
      );
    } else {
      setFastDeliveryEnabled(true);
      setExpressDeliveryEnabled(true);
    }

    return () => {
      unsubAddons();
      unsubTiers();
      if (unsubVendor) unsubVendor();
    };
  }, [laundryId, user, role]);

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

  return { customAddons, customTiers, resolveAddon, resolveTier, fastDeliveryEnabled, expressDeliveryEnabled, loading };
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
        isActive: true,
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
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });
    await batch.commit();
  }
}
