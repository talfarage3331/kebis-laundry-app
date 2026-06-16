import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { AppHeader } from "@/components/AppHeader";
import { useLaundry, ORDER_STEPS, stateLabel } from "@/lib/laundry-store";
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

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const { user, isProfileReady, orderState, createOrder } = useLaundry();

  const navigate = useNavigate();

  // Block all customer-specific rendering until the role is fully resolved from Firestore
  if (!isProfileReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="size-10 text-primary animate-spin" />
      </div>
    );
  }

  // Instant render-phase guard: redirect special roles immediately (isProfileReady guarantees role is set)
  if (user) {
    if (user.role === "laundry") {
      navigate({ to: "/laundry-dashboard", replace: true });
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="size-10 text-primary animate-spin" />
        </div>
      );
    }
    if (user.role === "admin") {
      navigate({ to: "/admin", replace: true });
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="size-10 text-primary animate-spin" />
        </div>
      );
    }
  }


  const [isModalOpen, setIsModalOpen] = useState(false);
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
          <EmptyState onOpenModal={() => setIsModalOpen(true)} />
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
              <EmptyState onOpenModal={() => setIsModalOpen(true)} />
            </div>
          </div>
        )}
      </main>

      <PickupModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={async (address, notes, images, requiresIroning, requiresDryCleaning, deliveryMethod) => {
          // Combine address + optional user notes into a single notes string stored in the DB
          const combinedNotes = [address, notes].filter(Boolean).join("\n\n");
          const orderId = await createOrder(
            combinedNotes,
            images,
            requiresIroning,
            requiresDryCleaning,
            deliveryMethod,
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

function EmptyState({ onOpenModal }: { onOpenModal: () => void }) {
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
  ) => Promise<void>;
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
  const [deliveryMethod, setDeliveryMethod] = useState<"self_pickup" | "home_delivery" | null>(null);
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
      setDeliveryMethod(null);

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

      await onSubmit(fullAddressString, notes, images, requiresIroning, requiresDryCleaning, deliveryMethod);

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
      setDeliveryMethod(null);
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

          {/* Additional Services Section */}
          <div className="space-y-2.5">
            <label className="text-sm font-bold text-foreground block">
              שירותים נוספים (אופציונלי)
            </label>
            <div className="grid grid-cols-2 gap-4 text-right dir-rtl" dir="rtl">
              {/* Ironing Card */}
              <div
                onClick={() => setRequiresIroning(!requiresIroning)}
                className={`relative overflow-hidden rounded-2xl sm:rounded-3xl p-3 sm:p-4 min-h-[44px] flex flex-col items-center justify-center gap-2 sm:gap-3 text-center cursor-pointer transition-all duration-300 border select-none ${
                  requiresIroning
                    ? "border-2 border-primary bg-primary/10 shadow-[0_8px_30px_rgba(124,58,237,0.15)] scale-[1.02]"
                    : "border-muted-foreground/10 bg-background/50 hover:bg-muted/30 hover:shadow-sm"
                }`}
              >
                {requiresIroning && (
                  <span className="absolute top-2.5 right-2.5 size-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm animate-in scale-in duration-200">
                    <Check className="size-3 stroke-[3]" />
                  </span>
                )}
                <div
                  className={`size-12 rounded-2xl flex items-center justify-center transition-all ${
                    requiresIroning ? "bg-primary/20 scale-110" : "bg-muted/60"
                  }`}
                >
                  <Shirt
                    className={`size-6 transition-colors ${requiresIroning ? "text-primary animate-pulse" : "text-muted-foreground"}`}
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span
                    className={`text-sm font-black transition-colors ${requiresIroning ? "text-primary" : "text-foreground"}`}
                  >
                    גיהוץ 🧺
                  </span>
                  <span className="text-[10px] font-medium text-muted-foreground leading-normal">
                    כולל קיפול ריחני
                  </span>
                </div>
              </div>

              {/* Dry Cleaning Card */}
              <div
                onClick={() => setRequiresDryCleaning(!requiresDryCleaning)}
                className={`relative overflow-hidden rounded-2xl sm:rounded-3xl p-3 sm:p-4 min-h-[44px] flex flex-col items-center justify-center gap-2 sm:gap-3 text-center cursor-pointer transition-all duration-300 border select-none ${
                  requiresDryCleaning
                    ? "border-2 border-primary bg-primary/10 shadow-[0_8px_30px_rgba(124,58,237,0.15)] scale-[1.02]"
                    : "border-muted-foreground/10 bg-background/50 hover:bg-muted/30 hover:shadow-sm"
                }`}
              >
                {requiresDryCleaning && (
                  <span className="absolute top-2.5 right-2.5 size-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm animate-in scale-in duration-200">
                    <Check className="size-3 stroke-[3]" />
                  </span>
                )}
                <div
                  className={`size-12 rounded-2xl flex items-center justify-center transition-all ${
                    requiresDryCleaning ? "bg-primary/20 scale-110" : "bg-muted/60"
                  }`}
                >
                  <Sparkles
                    className={`size-6 transition-colors ${requiresDryCleaning ? "text-primary" : "text-muted-foreground"}`}
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span
                    className={`text-sm font-black transition-colors ${requiresDryCleaning ? "text-primary" : "text-foreground"}`}
                  >
                    ניקוי יבש ✨
                  </span>
                  <span className="text-[10px] font-medium text-muted-foreground leading-normal">
                    הסרת כתמים וטיפול עדין
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-foreground block">
              צילום כתמים או פריטים עדינים (אופציונלי)
            </label>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-muted-foreground/20 hover:border-primary/50 transition-colors rounded-2xl p-4 sm:p-6 text-center cursor-pointer flex flex-col items-center justify-center gap-2 bg-muted/30 group min-h-[44px]"
            >
              <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Camera className="size-6 text-primary" />
              </div>
              <p className="text-sm font-semibold text-foreground">לחץ להעלאת תמונות</p>
              <p className="text-xs text-muted-foreground">ניתן להעלות מספר תמונות</p>
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
                    className="relative size-16 sm:size-20 rounded-2xl overflow-hidden group border border-muted-foreground/10 shadow-sm"
                  >
                    <img src={img} alt="תצוגה מקדימה" className="size-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="absolute top-1 left-1 size-7 sm:size-6 rounded-full bg-destructive/90 text-destructive-foreground grid place-items-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity active:scale-95 shadow-sm"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
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
