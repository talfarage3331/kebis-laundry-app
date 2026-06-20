import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { AppHeader } from "@/components/AppHeader";
import { useLaundry, ORDER_STEPS, stateLabel, ADDONS_META, DELIVERY_TIERS_META } from "@/lib/laundry-store";
import { useLaundryOptions, seedDefaultsIfEmpty } from "@/hooks/use-laundry-options";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import {
  ShoppingBasket,
  ChevronLeft,
  Check,
  Camera,
  Trash2,
  Sparkles,
  Loader2,
  Shirt,
  MapPin,
  MessageCircle,
  Store,
  Truck,
  Tag,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { PricingView } from "@/components/PricingView";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const { user, isProfileReady, role, isRoleLoading, orderState, createOrder } = useLaundry();

  const navigate = useNavigate();

  // Block all customer-specific rendering until the role is fully resolved from Firestore
  if (!isProfileReady || isRoleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="size-10 text-primary animate-spin" />
      </div>
    );
  }

  // Instant render-phase guard: redirect special roles immediately (isProfileReady guarantees role is set)
  if (user) {
    const currentRole = user.role || role || "customer";
    if (currentRole === "laundry") {
      navigate({ to: "/laundry-dashboard", replace: true });
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="size-10 text-primary animate-spin" />
        </div>
      );
    }
    if (currentRole === "admin") {
      navigate({ to: "/admin", replace: true });
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="size-10 text-primary animate-spin" />
        </div>
      );
    }
  }


  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPricingOpen, setIsPricingOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [confirmationData, setConfirmationData] = useState<{
    orderId: string;
    address: string;
    notes: string;
    requiresIroning: boolean;
    requiresDryCleaning: boolean;
    imageCount: number;
    deliveryMethod: "self_pickup" | "home_delivery";
  } | null>(null);

  // Fetch unread message count for the customer

  useEffect(() => {
    if (!user?.email) return;

    const q = query(collection(db, `chats/${user.email}/messages`), where("is_read", "==", false));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const unread = snapshot.docs.filter((doc) => doc.data().sender_email !== user.email).length;
      setUnreadCount(unread);
    });

    return () => unsubscribe();
  }, [user?.email]);

  return (
    <AppLayout>
      <AppHeader subtitle={user ? `שלום, ${user.name}` : undefined} />
      <main className="px-4 sm:px-5 mt-4 sm:mt-6 pb-8">
        {orderState === "none" || orderState === "delivered" || orderState === "cancelled" ? (
          <EmptyState onOpenModal={() => setIsModalOpen(true)} onOpenPricing={() => setIsPricingOpen(true)} />
        ) : (
          <div className="space-y-6">
            <div className="bg-lavender/40 border border-lavender-foreground/10 rounded-3xl p-4 sm:p-6 text-center space-y-3 sm:space-y-4">
              <div className="size-16 bg-lime rounded-full grid place-items-center mx-auto shadow-sm">
                <ShoppingBasket className="size-8 text-lime-foreground animate-pulse" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-extrabold text-foreground">יש לך כביסה בטיפול!</h3>
                <p className="text-xs text-muted-foreground leading-relaxed px-2 sm:px-4 break-words">
                  הזמנתך התקבלה בהצלחה ונמצאת כעת בשלבי טיפול. תוכל לעקוב אחר ההתקדמות ולבצע תשלום
                  במסך המעקב.
                </p>
              </div>
              <button
                onClick={() => navigate({ to: "/tracking" })}
                className="mt-2 w-full rounded-2xl bg-primary text-primary-foreground py-3 min-h-[44px] text-sm font-semibold hover:shadow-lg active:scale-95 transition"
              >
                עבור למסך מעקב הזמנה
              </button>
            </div>

            <div className="pt-6 border-t border-border/60 flex flex-col items-center gap-2">
              <span className="text-sm font-bold text-muted-foreground">
                רוצה לבצע הזמנה נוספת?
              </span>
              <EmptyState onOpenModal={() => setIsModalOpen(true)} onOpenPricing={() => setIsPricingOpen(true)} />
            </div>
          </div>
        )}
      </main>

      <PickupModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={async (
          address,
          notes,
          images,
          requiresIroning,
          requiresDryCleaning,
          deliveryMethod,
          addons,
          deliveryTier,
          basePrice,
          totalPrice,
          requiresWashing,
          laundryId,
        ) => {
          // Combine address + optional user notes into a single notes string stored in the DB
          const combinedNotes = [address, notes].filter(Boolean).join("\n\n");
          const orderId = await createOrder(
            combinedNotes,
            images,
            requiresIroning,
            requiresDryCleaning,
            deliveryMethod,
            addons,
            deliveryTier,
            basePrice,
            totalPrice,
            requiresWashing,
            laundryId,
          );
          setIsModalOpen(false);
          if (orderId) {
            toast.success("הזמנת האיסוף נוצרה בהצלחה!");
            setConfirmationData({
              orderId,
              address,
              notes,
              requiresIroning,
              requiresDryCleaning,
              imageCount: images.length,
              deliveryMethod,
            });
          } else {
            toast.error("שגיאה ביצירת ההזמנה. אנא נסה שוב.");
          }
        }}
      />

      <OrderConfirmationModal
        data={confirmationData}
        onClose={() => {
          const orderId = confirmationData?.orderId;
          setConfirmationData(null);
          if (orderId) navigate({ to: "/tracking", search: { orderId } });
        }}
      />

      <Dialog open={isPricingOpen} onOpenChange={(open) => !open && setIsPricingOpen(false)}>
        <DialogContent
          className="w-[92vw] max-w-lg p-0 overflow-hidden rounded-[2.5rem] border-none gap-0 h-[80vh] flex flex-col"
          dir="rtl"
        >
          <PricingView onClose={() => setIsPricingOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Chat FAB */}
      <Link
        to="/chat"
        preload="intent"
        className="fixed bottom-32 sm:bottom-24 right-5 size-14 bg-primary text-primary-foreground rounded-full shadow-[0_10px_25px_-5px_oklch(0.34_0.13_333/0.5)] grid place-items-center active:scale-95 transition-all z-50 hover:bg-primary/90"
      >
        <MessageCircle className="size-6" strokeWidth={2} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1.5 bg-red-500 text-white text-[11px] font-bold rounded-full flex items-center justify-center shadow-md animate-bounce">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Link>
    </AppLayout>
  );
}

function EmptyState({ onOpenModal, onOpenPricing }: { onOpenModal: () => void; onOpenPricing: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 pt-4">
      <button
        onClick={onOpenModal}
        className="relative group size-48 sm:size-64 rounded-full bg-lime text-lime-foreground shadow-[0_20px_50px_-12px_oklch(0.92_0.18_125/0.6)] active:scale-95 transition-all duration-300 flex flex-col items-center justify-center gap-2 sm:gap-3"
      >
        <ShoppingBasket className="size-12 sm:size-16" strokeWidth={1.5} />
        <span className="text-base sm:text-xl font-extrabold leading-tight px-4 sm:px-6 text-center">
          הזמן איסוף כביסה
        </span>
      </button>
      <p className="text-sm text-muted-foreground mt-1">לחיצה אחת ואנחנו בדרך אליך</p>

      <button
        onClick={onOpenPricing}
        className="mt-2 flex items-center gap-2 px-6 py-2.5 rounded-full border border-primary/20 text-primary hover:bg-primary/5 active:scale-95 transition text-sm font-bold shadow-sm"
      >
        <Tag className="size-4" />
        <span>צפייה במחירון השירותים</span>
      </button>
    </div>
  );
}

interface PickupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (
    address: string,
    notes: string,
    images: string[],
    requiresIroning: boolean,
    requiresDryCleaning: boolean,
    deliveryMethod: "self_pickup" | "home_delivery",
    addons: string[],
    deliveryTier: string,
    basePrice: number,
    totalPrice: number,
    requiresWashing: boolean,
    laundryId: string,
  ) => Promise<void>;
}

interface AddonRowProps {
  id: string;
  label: string;
  price: number;
  desc: string;
  selected: boolean;
  onToggle: () => void;
}

function AddonRow({ label, price, desc, selected, onToggle }: AddonRowProps) {
  return (
    <div
      onClick={onToggle}
      className="flex items-center w-full py-3.5 border-b border-slate-100 transition-all cursor-pointer select-none text-right gap-3"
      dir="rtl"
    >
      <div className="shrink-0">
        <div
          className={`size-5 rounded-md border flex items-center justify-center transition-all ${
            selected
              ? "bg-primary border-primary text-primary-foreground scale-110"
              : "border-muted-foreground/30 bg-background"
          }`}
        >
          {selected && <Check className="size-3.5 stroke-[3]" />}
        </div>
      </div>

      <div className="flex-1 min-w-0 text-right">
        <div className="flex items-center gap-1.5 flex-wrap justify-start">
          <span className="text-sm font-bold text-foreground">{label}</span>
          {price > 0 && (
            <span className="text-[10px] font-black text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              +₪{price}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

interface RadioRowProps {
  id: string;
  label: string;
  price: number;
  desc: string;
  selected: boolean;
  onSelect: () => void;
}

function RadioRow({ label, price, desc, selected, onSelect }: RadioRowProps) {
  return (
    <div
      onClick={onSelect}
      className="flex items-center w-full py-3.5 border-b border-slate-100 transition-all cursor-pointer select-none text-right gap-3"
      dir="rtl"
    >
      <div className="shrink-0">
        <div
          className={`size-5 rounded-full border-2 flex items-center justify-center transition-all ${
            selected
              ? "border-primary scale-110"
              : "border-muted-foreground/30 bg-background"
          }`}
        >
          {selected && <div className="size-2.5 rounded-full bg-primary" />}
        </div>
      </div>

      <div className="flex-1 min-w-0 text-right">
        <div className="flex items-center gap-1.5 flex-wrap justify-start">
          <span className="text-sm font-bold text-foreground">{label}</span>
          {price > 0 && (
            <span className="text-[10px] font-black text-primary bg-primary/10 px-2 py-0.5 rounded-full">
              +₪{price}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function PickupModal({ isOpen, onClose, onSubmit }: PickupModalProps) {
  const [addressSearchQuery, setAddressSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<any | null>(null);

  const [houseNumber, setHouseNumber] = useState("");
  const [apartment, setApartment] = useState("");
  const [floor, setFloor] = useState("");
  const [entrance, setEntrance] = useState("");

  const [notes, setNotes] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [requiresIroning, setRequiresIroning] = useState(false);
  const [requiresDryCleaning, setRequiresDryCleaning] = useState(false);
  const [requiresWashing, setRequiresWashing] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState<"self_pickup" | "home_delivery" | null>(null);
  
  // Wolt add-ons and delivery tier states
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [deliveryTier, setDeliveryTier] = useState<string>("standard");
  const [phoneNumber, setPhoneNumber] = useState("");

  // ── Multi-tenant: read active tenant from context ────────────────────────────────
  const { activeTenantId, activeTenantName } = useLaundry();
  const hasTenant = Boolean(activeTenantId);

  // Laundry shops state & option hook
  const { customAddons, customTiers } = useLaundryOptions();
  const [laundryShops, setLaundryShops] = useState<{ id: string; name: string }[]>([]);
  const [selectedLaundry, setSelectedLaundry] = useState<{ id: string; name: string } | null>(null);

  // Determine the effective laundry ID to use:
  // - If a tenant is active (via slug), always use that.
  // - Otherwise fall back to the dropdown selection.
  const effectiveLaundryId = hasTenant ? (activeTenantId ?? "") : (selectedLaundry?.id ?? "");
  const effectiveLaundryName = hasTenant ? (activeTenantName ?? "") : (selectedLaundry?.name ?? "");

  // Load laundry shops (only needed for the fallback dropdown)
  useEffect(() => {
    if (hasTenant) return; // Skip shop loading when tenant is pre-set by slug
    const q = query(collection(db, "users"), where("role", "==", "laundry"));
    const unsub = onSnapshot(q, (snapshot) => {
      const shops = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          name: d.businessName || d.fullName || d.name || `מכבסה #${docSnap.id.slice(0, 4)}`,
        };
      });
      setLaundryShops(shops);
      if (shops.length > 0 && !selectedLaundry) {
        setSelectedLaundry(shops[0]);
      } else if (shops.length === 0) {
        const fallback = { id: "default_laundry", name: "מכבסה ראשית Kebisa" };
        setLaundryShops([fallback]);
        setSelectedLaundry(fallback);
      }
    });
    return () => unsub();
  }, [hasTenant, selectedLaundry]);

  // Seed default options if the selected laundry shop has none
  useEffect(() => {
    if (isOpen && effectiveLaundryId) {
      seedDefaultsIfEmpty(effectiveLaundryId);
    }
  }, [isOpen, effectiveLaundryId]);

  // Filter addons & delivery tiers for the active/selected shop
  const shopAddonsList = customAddons.filter(a => a.laundryId === effectiveLaundryId);
  const shopTiersList = customTiers.filter(t => t.laundryId === effectiveLaundryId);

  // Build options maps
  const shopAddons: Record<string, { label: string; price: number; group: string; desc: string }> = {};
  if (shopAddonsList.length > 0) {
    shopAddonsList.forEach(a => {
      shopAddons[a.key] = { label: a.label, price: a.price, group: a.group, desc: a.desc };
    });
  } else {
    Object.entries(ADDONS_META).forEach(([k, v]) => {
      shopAddons[k] = v;
    });
  }

  const shopTiers: Record<string, { label: string; price: number; desc: string }> = {};
  if (shopTiersList.length > 0) {
    shopTiersList.forEach(t => {
      shopTiers[t.key] = { label: t.label, price: t.price, desc: t.desc };
    });
  } else {
    Object.entries(DELIVERY_TIERS_META).forEach(([k, v]) => {
      shopTiers[k] = v;
    });
  }

  const toggleAddon = (key: string) => {
    setSelectedAddons((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const handleDeliveryMethodChange = (method: "self_pickup" | "home_delivery") => {
    setDeliveryMethod(method);
    if (method === "self_pickup") {
      setDeliveryTier("standard");
      setPhoneNumber("");
      setSelectedAddons((prev) => prev.filter((k) => k !== "contactless" && k !== "phone_coord"));
    } else {
      setSelectedAddons((prev) => prev.filter((k) => k !== "quick_pickup" && k !== "express_wash"));
    }
  };

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [recentAddresses, setRecentAddresses] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setAddressSearchQuery("");
      setSuggestions([]);
      setIsSearching(false);
      setSelectedAddress(null);
      setHouseNumber("");
      setApartment("");
      setFloor("");
      setEntrance("");
      setNotes("");
      setImages([]);
      setRequiresIroning(false);
      setRequiresDryCleaning(false);
      setRequiresWashing(false);
      setDeliveryMethod(null);
      setSelectedAddons([]);
      setDeliveryTier("standard");
      setPhoneNumber("");

      // Load recent addresses
      try {
        const stored = localStorage.getItem("recent_laundry_addresses");
        if (stored) {
          setRecentAddresses(JSON.parse(stored));
        }
      } catch (e) {
        console.error(e);
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (
      !addressSearchQuery ||
      addressSearchQuery.length < 3 ||
      (selectedAddress && selectedAddress.display_name === addressSearchQuery)
    ) {
      setSuggestions([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(addressSearchQuery)}&format=json&accept-language=he&countrycodes=il&addressdetails=1&limit=5`,
        );
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [addressSearchQuery, selectedAddress]);

  const handleSelectSuggestion = (item: any) => {
    const addr = item.address || {};
    const street = addr.road || addr.pedestrian || addr.suburb || "";
    const houseNum = addr.house_number || "";
    const city = addr.city || addr.town || addr.village || "";

    let finalAddr = "";
    if (street) {
      finalAddr = `${street}${city ? ", " + city : ""}`;
    } else {
      finalAddr = item.display_name.split(",").slice(0, 3).join(",");
    }

    setSelectedAddress({
      display_name: finalAddr,
      raw: item,
    });
    setAddressSearchQuery(finalAddr);
    if (houseNum) {
      setHouseNumber(houseNum);
    } else {
      setHouseNumber("");
    }
    setSuggestions([]);
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      toast.error("הדפדפן שלך אינו תומך בזיהוי מיקום");
      return;
    }

    setIsLocating(true);
    toast.info("מזהה מיקום נוכחי...");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=he&addressdetails=1`,
          );
          if (res.ok) {
            const data = await res.json();
            if (data && data.address) {
              const addr = data.address;
              const street = addr.road || addr.pedestrian || addr.suburb || "";
              const houseNum = addr.house_number || "";
              const city = addr.city || addr.town || addr.village || "";

              let finalAddr = "";
              if (street) {
                finalAddr = `${street}${city ? ", " + city : ""}`;
              } else {
                finalAddr = data.display_name.split(",").slice(0, 3).join(",");
              }

              setSelectedAddress({
                display_name: finalAddr,
                raw: data,
              });
              setAddressSearchQuery(finalAddr);
              if (houseNum) setHouseNumber(houseNum);
              toast.success("המיקום זוהה בהצלחה!");
              setIsLocating(false);
              return;
            }
          }
        } catch (e) {
          console.error(e);
        }

        // Fallback if reverse geocoding fails
        const fallbackAddr = `מיקום נוכחי (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`;
        setSelectedAddress({
          display_name: fallbackAddr,
          raw: { display_name: fallbackAddr },
        });
        setAddressSearchQuery(fallbackAddr);
        toast.success("המיקום נקבע לפי קואורדינטות");
        setIsLocating(false);
      },
      (error) => {
        setIsLocating(false);
        if (error.code === error.PERMISSION_DENIED) {
          toast.error("אין הרשאת גישה למיקום המכשיר. אנא אפשר גישה בהגדרות הדפדפן");
        } else {
          toast.error("שגיאה בזיהוי המיקום");
        }
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const handleSelectRecent = (recent: string | any) => {
    if (typeof recent === "string") {
      // Backward compatibility for old string format
      setSelectedAddress({
        display_name: recent,
        raw: {},
      });
      setAddressSearchQuery(recent);
      setHouseNumber("");
      setFloor("");
      setApartment("");
      setEntrance("");
    } else {
      setSelectedAddress({
        display_name: recent.display_name,
        raw: {},
      });
      setAddressSearchQuery(recent.display_name);
      setHouseNumber(recent.houseNumber || "");
      setFloor(recent.floor || "");
      setApartment(recent.apartment || "");
      setEntrance(recent.entrance || "");
    }
    toast.success("הכתובת שוחזרה מההיסטוריה!");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) {
        toast.error("אנא בחר קבצי תמונה בלבד");
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          setImages((prev) => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!selectedAddress) {
      toast.error("אנא בחר כתובת מאומתת מתוך רשימת ההצעות");
      return;
    }
    if (!houseNumber.trim()) {
      toast.error("אנא הזן מספר בית");
      return;
    }
    if (!floor.trim()) {
      toast.error("אנא הזן קומה");
      return;
    }
    if (!apartment.trim()) {
      toast.error("אנא הזן מספר דירה");
      return;
    }
    if (!deliveryMethod) {
      toast.error("אנא בחר שיטת מסירה");
      return;
    }
    if (deliveryMethod === "home_delivery" && selectedAddons.includes("phone_coord") && !phoneNumber.trim()) {
      toast.error("אנא הזן מספר טלפון לתיאום");
      return;
    }

    setIsSubmitting(true);
    try {
      const baseAddr = selectedAddress.display_name;
      const fullAddressString = `${baseAddr}, בית ${houseNumber.trim()}, קומה ${floor.trim()}, דירה ${apartment.trim()}${entrance.trim() ? ", כניסה " + entrance.trim() : ""}`;

      // Save unique address to recent locations
      const recentObj = {
        display_name: baseAddr,
        houseNumber: houseNumber.trim(),
        floor: floor.trim(),
        apartment: apartment.trim(),
        entrance: entrance.trim(),
      };

      const updatedRecents = [
        recentObj,
        ...recentAddresses.filter((addr: any) => {
          const dName = typeof addr === "string" ? addr : addr.display_name;
          return dName !== baseAddr;
        }),
      ].slice(0, 5);

      localStorage.setItem("recent_laundry_addresses", JSON.stringify(updatedRecents));

      const addonsPriceSum = selectedAddons.reduce((sum, key) => sum + (shopAddons[key]?.price || 0), 0);
      const deliveryTierPrice = deliveryMethod === "home_delivery" ? (shopTiers[deliveryTier]?.price || 0) : 0;
      const estimatedTotalPrice = addonsPriceSum + deliveryTierPrice;

      const finalNotes = deliveryMethod === "home_delivery" && selectedAddons.includes("phone_coord") && phoneNumber.trim()
        ? `${notes}${notes.trim() ? " | " : ""}טלפון לתיאום: ${phoneNumber.trim()}`
        : notes;

      await onSubmit(
        fullAddressString,
        finalNotes,
        images,
        requiresIroning,
        requiresDryCleaning,
        deliveryMethod,
        selectedAddons,
        deliveryMethod === "home_delivery" ? deliveryTier : "standard",
        0,
        estimatedTotalPrice,
        requiresWashing,
        effectiveLaundryId || "default_laundry"
      );

      setAddressSearchQuery("");
      setSelectedAddress(null);
      setHouseNumber("");
      setFloor("");
      setApartment("");
      setEntrance("");
      setNotes("");
      setImages([]);
      setRequiresIroning(false);
      setRequiresDryCleaning(false);
      setRequiresWashing(false);
      setDeliveryMethod(null);
      setSelectedAddons([]);
      setDeliveryTier("standard");
    } catch (e) {
      toast.error("שגיאה ביצירת ההזמנה");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-md w-[95%] sm:w-[92%] max-h-[90vh] overflow-y-auto overflow-x-hidden rounded-2xl sm:rounded-3xl p-4 sm:p-6 text-right dir-rtl backdrop-blur-xl bg-background/95 border-none shadow-[0_20px_50px_rgba(0,0,0,0.15)] focus:outline-none"
        dir="rtl"
      >
        <DialogHeader className="space-y-2 text-right">
          <DialogTitle className="text-xl sm:text-2xl font-extrabold text-foreground flex items-center gap-2 justify-start">
            <Sparkles className="size-6 text-primary animate-pulse" />
            <span>פרטי איסוף כביסה</span>
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground text-right">
            הוסף דגשים מיוחדים או תמונות כדי שנדע בדיוק איך לטפל בבגדים שלך
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 my-4 text-right">
          {/* Shop Banner / Selection Field — Chameleon UI */}
          {hasTenant ? (
            /* TENANT MODE: show branded banner instead of dropdown */
            <div className="flex items-center gap-2.5 bg-primary/8 border border-primary/20 rounded-2xl px-4 py-3">
              <div className="size-8 rounded-full bg-primary/15 grid place-items-center shrink-0">
                <Store className="size-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-primary uppercase tracking-wider">מכבסה פעילה</p>
                <p className="text-sm font-extrabold text-foreground truncate">{effectiveLaundryName}</p>
              </div>
              <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full whitespace-nowrap">✓ מחובר</span>
            </div>
          ) : (
            /* FALLBACK MODE: show shop selector dropdown */
            <div className="space-y-2 text-right">
              <label className="text-sm font-bold text-foreground block">
                בחר סניף / מכבסה <span className="text-destructive font-black">*</span>
              </label>
              <select
                value={selectedLaundry?.id || ""}
                onChange={(e) => {
                  const shop = laundryShops.find(s => s.id === e.target.value);
                  if (shop) setSelectedLaundry(shop);
                }}
                className="w-full h-11 px-3 rounded-2xl border border-muted-foreground/20 bg-background text-foreground text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary text-right appearance-none"
                dir="rtl"
              >
                {laundryShops.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    🏪 {shop.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Pickup Address Field */}
          <div className="space-y-2 relative">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-foreground block">
                כתובת איסוף כביסה <span className="text-destructive font-black">*</span>
              </label>
              {selectedAddress && (
                <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1 select-none animate-in fade-in zoom-in duration-200 animate-pulse">
                  כתובת מאומתת ✓
                </span>
              )}
            </div>

            <div className="relative">
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={addressSearchQuery}
                  onChange={(e) => {
                    setAddressSearchQuery(e.target.value);
                    if (selectedAddress) setSelectedAddress(null);
                  }}
                  onBlur={() => {
                    if (!selectedAddress) {
                      setAddressSearchQuery("");
                    } else {
                      setAddressSearchQuery(selectedAddress.display_name);
                    }
                  }}
                  placeholder="הקלד רחוב ועיר לאימות הכתובת..."
                  className="w-full rounded-2xl border border-muted-foreground/20 focus-visible:ring-primary focus-visible:border-primary text-sm pl-12 pr-4 py-3.5 min-h-[44px] leading-normal text-right focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                  dir="rtl"
                />
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleGetLocation();
                  }}
                  disabled={isLocating}
                  className="absolute left-2.5 p-2 min-w-[44px] min-h-[44px] rounded-xl text-primary hover:bg-primary/10 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center"
                  title="זהה מיקום נוכחי"
                >
                  {isLocating ? (
                    <Loader2 className="size-5 animate-spin text-primary" />
                  ) : (
                    <MapPin className="size-5 text-primary" />
                  )}
                </button>
              </div>

              {/* Autocomplete Dropdown suggestions list */}
              {suggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-background border border-muted-foreground/20 rounded-2xl shadow-xl max-h-48 overflow-y-auto divide-y divide-muted-foreground/10 animate-in fade-in slide-in-from-top-1 duration-200">
                  {suggestions.map((item, idx) => {
                    return (
                      <button
                        key={idx}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectSuggestion(item);
                        }}
                        className="w-full text-right px-4 py-3 min-h-[44px] hover:bg-muted text-xs font-semibold text-foreground transition flex items-center gap-2"
                      >
                        <MapPin className="size-3.5 text-primary flex-shrink-0" />
                        <span className="truncate">{item.display_name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Structured Sub-fields (House Number, Floor, Apartment, Entrance) */}
            {selectedAddress && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 pt-2 animate-in slide-in-from-top-2 duration-300">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-foreground block text-right">
                    בית <span className="text-destructive font-black">*</span>
                  </label>
                  <input
                    type="text"
                    value={houseNumber}
                    onChange={(e) => setHouseNumber(e.target.value)}
                    placeholder="בית"
                    className="w-full rounded-xl border border-muted-foreground/20 focus-visible:ring-primary focus-visible:border-primary text-xs p-3 min-h-[44px] text-center focus:outline-none focus:ring-2 focus:ring-primary bg-background font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-foreground block text-right">
                    קומה <span className="text-destructive font-black">*</span>
                  </label>
                  <input
                    type="text"
                    value={floor}
                    onChange={(e) => setFloor(e.target.value)}
                    placeholder="קומה"
                    className="w-full rounded-xl border border-muted-foreground/20 focus-visible:ring-primary focus-visible:border-primary text-xs p-3 text-center focus:outline-none focus:ring-2 focus:ring-primary bg-background font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-foreground block text-right">
                    דירה <span className="text-destructive font-black">*</span>
                  </label>
                  <input
                    type="text"
                    value={apartment}
                    onChange={(e) => setApartment(e.target.value)}
                    placeholder="דירה"
                    className="w-full rounded-xl border border-muted-foreground/20 focus-visible:ring-primary focus-visible:border-primary text-xs p-3 text-center focus:outline-none focus:ring-2 focus:ring-primary bg-background font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-foreground block text-right">
                    כניסה / קוד
                  </label>
                  <input
                    type="text"
                    value={entrance}
                    onChange={(e) => setEntrance(e.target.value)}
                    placeholder="כניסה"
                    className="w-full rounded-xl border border-muted-foreground/20 focus-visible:ring-primary focus-visible:border-primary text-xs p-3 text-center focus:outline-none focus:ring-2 focus:ring-primary bg-background font-bold"
                  />
                </div>
              </div>
            )}

            {/* Recent Locations */}
            {recentAddresses.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] font-black text-muted-foreground block">
                  כתובות אחרונות בשימוש:
                </span>
                <div className="flex flex-wrap gap-1.5 justify-start">
                  {recentAddresses.map((addr, idx) => {
                    const disp = typeof addr === "string" ? addr : addr.display_name;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectRecent(addr);
                        }}
                        className="text-xs px-3 py-1.5 min-h-[36px] rounded-full border border-muted-foreground/10 bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 select-none"
                      >
                        <MapPin className="size-3 flex-shrink-0" />
                        <span className="truncate max-w-[150px]">{disp}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-foreground block">
              דגשים מיוחדים לכביסה (אופציונלי)
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="יש לך דגשים מיוחדים לכביסה? כתוב לנו כאן... (למשל: כביסה עדינה, כתם שומן בשרוול, להפריד צבעים)"
              className="min-h-[100px] rounded-2xl border-muted-foreground/20 focus-visible:ring-primary focus-visible:border-primary text-sm p-3 sm:p-4 leading-relaxed text-right"
              dir="rtl"
            />
          </div>

          {/* Service Type Grid */}
          <div className="space-y-2.5">
            <label className="text-sm font-bold text-foreground block">
              סוגי שירות מבוקשים
            </label>
            <div className="grid grid-cols-3 gap-2 sm:gap-3 text-right dir-rtl" dir="rtl">
              {/* Washing Card */}
              <div
                onClick={() => setRequiresWashing(!requiresWashing)}
                className={`relative overflow-hidden rounded-2xl p-2.5 sm:p-3.5 min-h-[44px] flex flex-col items-center justify-center gap-2 text-center cursor-pointer transition-all duration-300 border select-none ${
                  requiresWashing
                    ? "border-2 border-primary bg-primary/10 shadow-[0_8px_30px_rgba(124,58,237,0.15)] scale-[1.02]"
                    : "border-muted-foreground/10 bg-background/50 hover:bg-muted/30 hover:shadow-sm"
                }`}
              >
                {requiresWashing && (
                  <span className="absolute top-1.5 right-1.5 size-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm animate-in scale-in duration-200">
                    <Check className="size-2.5 stroke-[3]" />
                  </span>
                )}
                <div
                  className={`size-10 rounded-xl flex items-center justify-center transition-all ${
                    requiresWashing ? "bg-primary/20 scale-110" : "bg-muted/60"
                  }`}
                >
                  <Shirt
                    className={`size-5 transition-colors ${requiresWashing ? "text-primary animate-pulse" : "text-muted-foreground"}`}
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span
                    className={`text-xs font-black transition-colors ${requiresWashing ? "text-primary" : "text-foreground"}`}
                  >
                    כביסה 👕
                  </span>
                  <span className="text-[9px] font-medium text-muted-foreground leading-normal">
                    ניקוי וריענון
                  </span>
                </div>
              </div>

              {/* Ironing Card */}
              <div
                onClick={() => setRequiresIroning(!requiresIroning)}
                className={`relative overflow-hidden rounded-2xl p-2.5 sm:p-3.5 min-h-[44px] flex flex-col items-center justify-center gap-2 text-center cursor-pointer transition-all duration-300 border select-none ${
                  requiresIroning
                    ? "border-2 border-primary bg-primary/10 shadow-[0_8px_30px_rgba(124,58,237,0.15)] scale-[1.02]"
                    : "border-muted-foreground/10 bg-background/50 hover:bg-muted/30 hover:shadow-sm"
                }`}
              >
                {requiresIroning && (
                  <span className="absolute top-1.5 right-1.5 size-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm animate-in scale-in duration-200">
                    <Check className="size-2.5 stroke-[3]" />
                  </span>
                )}
                <div
                  className={`size-10 rounded-xl flex items-center justify-center transition-all ${
                    requiresIroning ? "bg-primary/20 scale-110" : "bg-muted/60"
                  }`}
                >
                  <Shirt
                    className={`size-5 transition-colors ${requiresIroning ? "text-primary animate-pulse" : "text-muted-foreground"}`}
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span
                    className={`text-xs font-black transition-colors ${requiresIroning ? "text-primary" : "text-foreground"}`}
                  >
                    גיהוץ 🧺
                  </span>
                  <span className="text-[9px] font-medium text-muted-foreground leading-normal">
                    קיפול וריח
                  </span>
                </div>
              </div>

              {/* Dry Cleaning Card */}
              <div
                onClick={() => setRequiresDryCleaning(!requiresDryCleaning)}
                className={`relative overflow-hidden rounded-2xl p-2.5 sm:p-3.5 min-h-[44px] flex flex-col items-center justify-center gap-2 text-center cursor-pointer transition-all duration-300 border select-none ${
                  requiresDryCleaning
                    ? "border-2 border-primary bg-primary/10 shadow-[0_8px_30px_rgba(124,58,237,0.15)] scale-[1.02]"
                    : "border-muted-foreground/10 bg-background/50 hover:bg-muted/30 hover:shadow-sm"
                }`}
              >
                {requiresDryCleaning && (
                  <span className="absolute top-1.5 right-1.5 size-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm animate-in scale-in duration-200">
                    <Check className="size-2.5 stroke-[3]" />
                  </span>
                )}
                <div
                  className={`size-10 rounded-xl flex items-center justify-center transition-all ${
                    requiresDryCleaning ? "bg-primary/20 scale-110" : "bg-muted/60"
                  }`}
                >
                  <Sparkles
                    className={`size-5 transition-colors ${requiresDryCleaning ? "text-primary" : "text-muted-foreground"}`}
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span
                    className={`text-xs font-black transition-colors ${requiresDryCleaning ? "text-primary" : "text-foreground"}`}
                  >
                    ניקוי יבש ✨
                  </span>
                  <span className="text-[9px] font-medium text-muted-foreground leading-normal">
                    טיפול עדין
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Delivery Method Selection */}
          <div className="space-y-2.5">
            <label className="text-sm font-bold text-foreground block">
              שיטת מסירה <span className="text-destructive font-black">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3" dir="rtl">
              <div
                onClick={() => handleDeliveryMethodChange("self_pickup")}
                className={`relative overflow-hidden rounded-2xl p-3 sm:p-4 min-h-[44px] flex flex-col items-center justify-center gap-2 text-center cursor-pointer transition-all duration-300 border select-none ${
                  deliveryMethod === "self_pickup"
                    ? "border-2 border-primary bg-lavender shadow-[0_8px_30px_rgba(124,58,237,0.15)] scale-[1.02]"
                    : "border-muted-foreground/10 bg-lavender/40 hover:bg-lavender/60"
                }`}
              >
                {deliveryMethod === "self_pickup" && (
                  <span className="absolute top-2.5 right-2.5 size-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
                    <Check className="size-3 stroke-[3]" />
                  </span>
                )}
                <Store className="size-6 text-lavender-foreground" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-black text-lavender-foreground">איסוף עצמי</span>
                  <span className="text-[10px] font-medium text-muted-foreground">איסוף מהחנות</span>
                </div>
              </div>
              <div
                onClick={() => handleDeliveryMethodChange("home_delivery")}
                className={`relative overflow-hidden rounded-2xl p-3 sm:p-4 min-h-[44px] flex flex-col items-center justify-center gap-2 text-center cursor-pointer transition-all duration-300 border select-none ${
                  deliveryMethod === "home_delivery"
                    ? "border-2 border-primary bg-lime shadow-[0_8px_30px_rgba(124,58,237,0.15)] scale-[1.02]"
                    : "border-muted-foreground/10 bg-lime/40 hover:bg-lime/60"
                }`}
              >
                {deliveryMethod === "home_delivery" && (
                  <span className="absolute top-2.5 right-2.5 size-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
                    <Check className="size-3 stroke-[3]" />
                  </span>
                )}
                <Truck className="size-6 text-lime-foreground" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-black text-lime-foreground">משלוח הביתה</span>
                  <span className="text-[10px] font-medium text-muted-foreground">עד פתח הדלת</span>
                </div>
              </div>
            </div>
          </div>

          {/* Group A: שדרוגי פרימיום */}
          <div className="space-y-3 pt-1">
            <div className="text-right">
              <h3 className="text-sm sm:text-base font-bold text-foreground">שדרוגי פרימיום ✨</h3>
              <p className="text-[11px] sm:text-xs text-slate-500">תוספת קבועה לשדרוג איכות הכביסה</p>
            </div>
            <div className="space-y-2">
              {Object.entries(shopAddons)
                .filter(([, meta]) => meta.group === "שדרוגי פרימיום")
                .map(([key, meta]) => (
                  <AddonRow
                    key={key}
                    id={key}
                    label={meta.label}
                    price={meta.price}
                    desc={meta.desc}
                    selected={selectedAddons.includes(key)}
                    onToggle={() => toggleAddon(key)}
                  />
                ))}
            </div>
          </div>

          {/* Group B: סוגי טיפול מיוחדים */}
          <div className="space-y-3">
            <div className="text-right">
              <h3 className="text-sm sm:text-base font-bold text-foreground">סוגי טיפול מיוחדים 🧺</h3>
              <p className="text-[11px] sm:text-xs text-slate-500">טיפול מותאם אישית לפי סוג הבגד</p>
            </div>
            <div className="space-y-2">
              {Object.entries(shopAddons)
                .filter(([, meta]) => meta.group === "סוגי טיפול מיוחדים")
                .map(([key, meta]) => (
                  <AddonRow
                    key={key}
                    id={key}
                    label={meta.label}
                    price={meta.price}
                    desc={meta.desc}
                    selected={selectedAddons.includes(key)}
                    onToggle={() => toggleAddon(key)}
                  />
                ))}
            </div>
          </div>

          {/* Group C: אפשרויות משלוח (Home delivery only) */}
          {deliveryMethod === "home_delivery" && (
            <div className="space-y-3 animate-in fade-in slide-in-from-top-3 duration-300">
              <div className="text-right">
                <h3 className="text-sm sm:text-base font-bold text-foreground">אפשרויות משלוח 🚗</h3>
                <p className="text-[11px] sm:text-xs text-slate-500">בחר את מהירות המשלוח המועדפת עליך</p>
              </div>
              <div className="space-y-2">
                {Object.entries(shopTiers).map(([key, meta]) => (
                  <RadioRow
                    key={key}
                    id={key}
                    label={meta.label}
                    price={meta.price}
                    desc={meta.desc}
                    selected={deliveryTier === key}
                    onSelect={() => setDeliveryTier(key)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Group E: שירותי איסוף עצמי (Self pickup only) */}
          {deliveryMethod === "self_pickup" && (
            <div className="space-y-3 animate-in fade-in slide-in-from-top-3 duration-300">
              <div className="text-right">
                <h3 className="text-sm sm:text-base font-bold text-foreground">שירותי איסוף עצמי 🧺</h3>
                <p className="text-[11px] sm:text-xs text-slate-500">שדרוגים מיוחדים לחוויית איסוף מהסניף</p>
              </div>
              <div className="space-y-2">
                {Object.entries(shopAddons)
                  .filter(([key]) => key === "quick_pickup" || key === "express_wash")
                  .map(([key, meta]) => (
                    <AddonRow
                      key={key}
                      id={key}
                      label={meta.label}
                      price={meta.price}
                      desc={meta.desc}
                      selected={selectedAddons.includes(key)}
                      onToggle={() => toggleAddon(key)}
                    />
                  ))}
              </div>
            </div>
          )}

          {/* Group D: חוויית לוגיסטיקה (Home delivery only) */}
          {deliveryMethod === "home_delivery" && (
            <div className="space-y-3 animate-in fade-in slide-in-from-top-3 duration-300">
              <div className="text-right">
                <h3 className="text-sm sm:text-base font-bold text-foreground">חוויית לוגיסטיקה 📦</h3>
                <p className="text-[11px] sm:text-xs text-slate-500">העדפות מסירה מיוחדות לשליח</p>
              </div>
              <div className="space-y-2">
                {Object.entries(shopAddons)
                  .filter(([, meta]) => meta.group === "חוויית לוגיסטיקה")
                  .map(([key, meta]) => (
                    <div key={key} className="w-full">
                      <AddonRow
                        id={key}
                        label={meta.label}
                        price={meta.price}
                        desc={meta.desc}
                        selected={selectedAddons.includes(key)}
                        onToggle={() => toggleAddon(key)}
                      />
                      {key === "phone_coord" && selectedAddons.includes("phone_coord") && (
                        <div className="pt-2.5 pb-2 px-1 animate-in slide-in-from-top-1 duration-200 text-right">
                          <label className="text-xs font-bold text-slate-700 block mb-1">
                            מספר טלפון לתיאום <span className="text-destructive font-black">*</span>
                          </label>
                          <input
                            type="tel"
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value)}
                            placeholder="למשל: 0501234567"
                            className="w-full rounded-xl border border-muted-foreground/20 focus-visible:ring-primary focus-visible:border-primary text-xs p-3 focus:outline-none focus:ring-2 focus:ring-primary bg-background font-bold text-right"
                            dir="rtl"
                          />
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* estimated price calculator */}
          <div className="rounded-2xl bg-muted/40 p-4 border border-border space-y-2 dir-rtl text-right mt-4" dir="rtl">
            <span className="text-xs font-bold text-muted-foreground block font-black">סיכום תוספות ושדרוגים</span>
            <div className="space-y-1.5 text-xs font-semibold">
              {selectedAddons.map((key) => {
                const meta = shopAddons[key];
                if (!meta) return null;
                return (
                  <div key={key} className="flex justify-between items-center text-muted-foreground animate-fade-in">
                    <span>{meta.label}</span>
                    <span>+₪{meta.price}</span>
                  </div>
                );
              })}
              {deliveryMethod === "home_delivery" && (shopTiers[deliveryTier]?.price || 0) > 0 && (
                <div className="flex justify-between items-center text-muted-foreground animate-fade-in">
                  <span>משלוח ({shopTiers[deliveryTier]?.label})</span>
                  <span>+₪{shopTiers[deliveryTier]?.price || 0}</span>
                </div>
              )}
              <div className="border-t border-border pt-1.5 flex justify-between items-center text-sm font-black text-foreground">
                <span>סה״כ תוספות</span>
                <span className="text-primary text-base font-black">
                  ₪{selectedAddons.reduce((sum, key) => sum + (shopAddons[key]?.price || 0), 0) + 
                    (deliveryMethod === "home_delivery" ? (shopTiers[deliveryTier]?.price || 0) : 0)
                  }
                </span>
              </div>
            </div>
            <p className="text-[10px] text-destructive font-bold leading-normal mt-2">
              * המחיר המוצג הנו עבור התוספות בלבד, לפני חישוב מחיר הכביסה לפי משקל בפועל במכבסה.
            </p>
          </div>

          {/* Section: דגשים מיוחדים וצילום */}
          <div className="space-y-4 border-t border-slate-100 pt-4">
            <h3 className="text-sm sm:text-base font-bold text-foreground">דגשים וצילומים 📸</h3>
            
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground block">
                דגשים מיוחדים לכביסה (אופציונלי)
              </label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="יש לך דגשים מיוחדים לכביסה? כתוב לנו כאן... (למשל: כביסה עדינה, להפריד צבעים)"
                className="min-h-[80px] rounded-2xl border-muted-foreground/20 focus-visible:ring-primary focus-visible:border-primary text-sm p-3 leading-relaxed text-right resize-none"
                dir="rtl"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground block">
                צילום כתמים או פריטים עדינים (אופציונלי)
              </label>

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-muted-foreground/20 hover:border-primary/50 transition-colors rounded-2xl p-4 text-center cursor-pointer flex flex-col items-center justify-center gap-2 bg-muted/30 group min-h-[44px]"
              >
                <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Camera className="size-5 text-primary" />
                </div>
                <p className="text-xs font-semibold text-foreground">לחץ להעלאת תמונות</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {images.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2 justify-start">
                  {images.map((img, idx) => (
                    <div
                      key={idx}
                      className="relative size-16 rounded-2xl overflow-hidden group border border-muted-foreground/10 shadow-sm"
                    >
                      <img src={img} alt="תצוגה מקדימה" className="size-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(idx)}
                        className="absolute top-1 left-1 size-6 rounded-full bg-destructive/90 text-destructive-foreground grid place-items-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity active:scale-95 shadow-sm"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !(requiresWashing || requiresIroning || requiresDryCleaning)}
            className="flex-1 rounded-3xl bg-lime text-lime-foreground py-3.5 sm:py-4 min-h-[48px] font-bold active:scale-[0.98] transition hover:shadow-lg hover:shadow-lime/20 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-5 animate-spin" />
                <span>מעבד הזמנה...</span>
              </>
            ) : (
              <span>אישור והזמנת איסוף</span>
            )}
          </button>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-3xl border border-muted-foreground/20 text-muted-foreground px-6 py-3.5 sm:py-4 min-h-[48px] font-bold active:scale-[0.98] transition w-full sm:w-auto"
          >
            ביטול
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface OrderConfirmationModalProps {
  data: {
    orderId: string;
    address: string;
    notes: string;
    requiresIroning: boolean;
    requiresDryCleaning: boolean;
    imageCount: number;
    deliveryMethod: "self_pickup" | "home_delivery";
  } | null;
  onClose: () => void;
}

function OrderConfirmationModal({ data, onClose }: OrderConfirmationModalProps) {
  return (
    <Dialog open={!!data} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-md w-[95%] sm:w-[92%] max-h-[85vh] overflow-y-auto overflow-x-hidden rounded-2xl sm:rounded-3xl p-4 sm:p-6 text-right dir-rtl backdrop-blur-xl bg-background/95 border-none shadow-[0_20px_50px_rgba(0,0,0,0.15)] focus:outline-none"
        dir="rtl"
      >
        <DialogHeader className="space-y-2 text-right">
          <DialogTitle className="text-xl sm:text-2xl font-extrabold text-foreground flex items-center gap-2 justify-start">
            <Check className="size-6 text-lime-foreground" />
            <span>ההזמנה נוצרה בהצלחה!</span>
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground text-right">
            סיכום פרטי ההזמנה שלך
          </DialogDescription>
        </DialogHeader>

        {data && (
          <div className="space-y-3 my-4 text-right">
            <div className="rounded-2xl border border-muted-foreground/10 bg-muted/30 p-4 space-y-2">
              <div>
                <p className="text-[10px] font-black text-muted-foreground">מזהה הזמנה</p>
                <p className="text-xs font-bold text-foreground font-mono">
                  #{data.orderId.slice(0, 8)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-black text-muted-foreground">כתובת איסוף</p>
                <p className="text-xs font-bold text-foreground whitespace-pre-wrap">
                  {data.address}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-black text-muted-foreground">שיטת מסירה</p>
                <p className="text-xs font-bold text-foreground">
                  {data.deliveryMethod === "self_pickup" ? "איסוף עצמי" : "משלוח הביתה"}
                </p>
              </div>
              {data.notes && (
                <div>
                  <p className="text-[10px] font-black text-muted-foreground">הערות</p>
                  <p className="text-xs text-foreground whitespace-pre-wrap">{data.notes}</p>
                </div>
              )}
              {(data.requiresIroning || data.requiresDryCleaning) && (
                <div>
                  <p className="text-[10px] font-black text-muted-foreground mb-1">שירותים נוספים</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {data.requiresIroning && (
                      <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
                        גיהוץ 🧺
                      </span>
                    )}
                    {data.requiresDryCleaning && (
                      <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
                        ניקוי יבש ✨
                      </span>
                    )}
                  </div>
                </div>
              )}
              {data.imageCount > 0 && (
                <div>
                  <p className="text-[10px] font-black text-muted-foreground">תמונות שצורפו</p>
                  <p className="text-xs font-bold text-foreground">{data.imageCount}</p>
                </div>
              )}
            </div>

            <div className="rounded-2xl border-2 border-amber-200/60 bg-amber-50 text-amber-900 p-4">
              <p className="text-xs font-bold leading-relaxed">
                ניתן לבטל את ההזמנה כל עוד הסטטוס שלה הוא <span className="font-black">'ממתין'</span>.
                ברגע שהסטטוס ישתנה ל-<span className="font-black">'התקבל'</span>, לא ניתן יהיה לבטל את ההזמנה.
              </p>
            </div>
          </div>
        )}

        <div className="mt-4">
          <button
            onClick={onClose}
            className="w-full rounded-3xl bg-lime text-lime-foreground py-3.5 min-h-[48px] font-bold active:scale-[0.98] transition hover:shadow-lg hover:shadow-lime/20"
          >
            אישור
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
