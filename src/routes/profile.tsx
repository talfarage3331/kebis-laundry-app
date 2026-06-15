import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { AppHeader } from "@/components/AppHeader";
import { useLaundry, stateLabel, normalizeStatus } from "@/lib/laundry-store";
import { LogOut, User as UserIcon, Mail, Loader2, ShoppingBasket, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useFcm } from "@/hooks/use-fcm";

export const Route = createFileRoute("/profile")({ component: Profile });

const getStatusBadgeStyle = (status: string) => {
  switch (status) {
    case "pending":
      return "bg-amber-50 text-amber-700 border border-amber-200/50";
    case "accepted":
      return "bg-blue-50 text-blue-700 border border-blue-200/50";
    case "collected":
      return "bg-indigo-50 text-indigo-700 border border-indigo-200/50";
    case "ready":
      return "bg-green-50 text-green-700 border border-green-200/50";
    case "delivered":
      return "bg-emerald-50 text-emerald-700 border border-emerald-200/50";
    case "cancelled":
      return "bg-red-50 text-red-700 border border-red-200/50";
    default:
      return "bg-muted text-muted-foreground";
  }
};

const getImagesArray = (images: any): string[] => {
  if (!images) return [];
  if (Array.isArray(images)) return images;
  if (typeof images === "string") {
    try {
      const parsed = JSON.parse(images);
      return Array.isArray(parsed) ? parsed : [images];
    } catch {
      return [images];
    }
  }
  return [];
};

function Profile() {
  const { user, logout } = useLaundry();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [fetchingOrders, setFetchingOrders] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

  const {
    token: fcmToken,
    permission: fcmPermission,
    isLoading: fcmLoading,
    requestPermission: fcmRequestPermission,
  } = useFcm();
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [testingPush, setTestingPush] = useState(false);

  const handleTestPush = async () => {
    const statusInfo = `סטטוס הרשאות: ${Notification.permission}\nטוקן FCM קיים: ${fcmToken ? "כן" : "לא"}\nטוקן: ${fcmToken || "ריק"}`;
    console.log("[FCM Diagnostic]", statusInfo);
    alert(`[אבחון התראות FCM]\n\n${statusInfo}`);

    if (!fcmToken) {
      alert("אין טוקן FCM זמין לשליחה. אנא אשר קבלת התראות תחילה.");
      return;
    }

    setTestingPush(true);
    try {
      const res = await fetch("/api/push/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: fcmToken,
          customTitle: "התראת ניסיון מוצלחת! 🚀",
          customBody: "ערוץ התקשורת של Firebase Messaging עובד בצורה תקינה לחלוטין.",
          url: "/profile",
        }),
      });

      const data = (await res.json()) as any;
      if (!res.ok) {
        throw new Error(data.detail || data.error || "שגיאת שרת לא ידועה");
      }

      toast.success("התראת הניסיון נשלחה בהצלחה!");
      alert(`התראת הניסיון נשלחה בהצלחה!\nתשובת השרת: ${JSON.stringify(data)}`);
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      console.error("[FCM Test Error]", err);
      alert(`שגיאה בשליחת התראת ניסיון!\nפרטי השגיאה:\n${errMsg}`);
      toast.error("שגיאה בשליחת התראת ניסיון");
    } finally {
      setTestingPush(false);
    }
  };

  useEffect(() => {
    if (!user?.email) return;

    const fetchOrders = async () => {
      setFetchingOrders(true);
      try {
        const q = query(collection(db, "orders"), where("user_email", "==", user.email));
        const snapshot = await getDocs(q);
        const filtered = snapshot.docs
          .map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              created_at: data.created_at || data.createdAt || new Date().toISOString(),
              status: data.status,
              delivery_method: data.delivery_method || data.deliveryMethod || "none",
              payment_state: data.payment_state || data.paymentState || "unpaid",
              amount_due:
                data.amount_due !== undefined
                  ? data.amount_due
                  : data.amountDue !== undefined
                    ? data.amountDue
                    : 0,
              user_email: data.user_email || data.userEmail || user.email,
              notes: data.notes || "",
              images: data.images || [],
            };
          })
          .filter((o) => o.delivery_method !== "placeholder" && !o.id.startsWith("placeholder"));

        // Sort by created_at descending
        filtered.sort(
          (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
        );

        setOrders(filtered);
      } catch (err) {
        console.error("Error fetching orders in profile:", err);
      } finally {
        setFetchingOrders(false);
      }
    };

    fetchOrders();
  }, [user]);

  return (
    <AppLayout>
      <AppHeader subtitle="הפרופיל שלי" />
      <main className="px-4 sm:px-5 mt-4 sm:mt-6 space-y-4 sm:space-y-6 pb-24">
        {/* User Info Card */}
        <div className="rounded-3xl bg-lavender text-lavender-foreground p-4 sm:p-6 flex items-center gap-3 sm:gap-4 shadow-sm border border-lavender-foreground/5 min-w-0">
          <div className="size-12 sm:size-16 rounded-full bg-primary text-primary-foreground grid place-items-center text-xl sm:text-2xl font-extrabold shadow-inner select-none flex-shrink-0">
            {user?.name?.[0] ?? "?"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base sm:text-lg font-extrabold text-foreground truncate">
              {user?.name}
            </p>
            <p className="text-xs sm:text-sm opacity-80 flex items-center gap-1.5 text-muted-foreground mt-0.5 min-w-0">
              <Mail className="size-3.5 flex-shrink-0" strokeWidth={2} />{" "}
              <span className="truncate">{user?.email}</span>
            </p>
          </div>
        </div>

        {/* Logout Button */}
        <button
          onClick={() => {
            logout();
            navigate({ to: "/login" });
          }}
          className="w-full flex items-center justify-between rounded-3xl bg-primary text-primary-foreground p-4 sm:p-5 min-h-[48px] font-bold shadow-md hover:shadow-lg active:scale-[0.98] transition group"
        >
          <span className="flex items-center gap-3">
            <LogOut
              className="size-5 group-hover:translate-x-1 transition-transform"
              strokeWidth={2}
            />
            <span>התנתקות</span>
          </span>
        </button>

        {/* push diagnostics section */}
        <div className="rounded-3xl border border-muted-foreground/10 bg-background/50 overflow-hidden">
          <button
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="w-full px-4 sm:px-6 py-4 flex items-center justify-between font-bold text-foreground text-sm hover:bg-muted/20 transition cursor-pointer"
          >
            <span>אבחון והגדרות התראות דחיפה (FCM)</span>
            <span className="text-xs text-muted-foreground">
              {showDiagnostics ? "◄ הסתר" : "▼ הצג"}
            </span>
          </button>

          {showDiagnostics && (
            <div className="p-4 sm:p-6 border-t border-muted-foreground/10 space-y-4 text-right">
              {/* Permission Status */}
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">הרשאת דפדפן:</span>
                <span
                  className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                    fcmPermission === "granted"
                      ? "bg-green-50 text-green-700 border border-green-200"
                      : fcmPermission === "denied"
                        ? "bg-red-50 text-red-700 border border-red-200"
                        : "bg-amber-50 text-amber-700 border border-amber-200"
                  }`}
                >
                  {fcmPermission === "granted"
                    ? "מאושר ✓"
                    : fcmPermission === "denied"
                      ? "חסום X"
                      : "ממתין להרשאה"}
                </span>
              </div>

              {/* FCM Token Status */}
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground">מזהה מכשיר (FCM Token):</span>
                <span className={`font-bold ${fcmToken ? "text-lime" : "text-amber-500"}`}>
                  {fcmToken ? "נוצר בהצלחה" : "לא קיים"}
                </span>
              </div>

              {/* Token Display and Copy */}
              {fcmToken && (
                <div className="space-y-1.5">
                  <span className="text-[10px] text-muted-foreground block">
                    הטוקן הנוכחי (משמש לניתוב):
                  </span>
                  <div className="flex items-center gap-1.5">
                    <input
                      readOnly
                      value={fcmToken}
                      className="flex-1 bg-muted text-muted-foreground text-[9px] font-mono p-2 rounded-lg border border-muted-foreground/10 text-left dir-ltr truncate outline-none select-all"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(fcmToken);
                        toast.success("הטוקן הועתק ללוח!");
                      }}
                      className="px-2.5 py-1.5 bg-primary/10 text-primary text-xs font-bold rounded-lg border border-primary/20 hover:bg-primary/20 active:scale-95 transition"
                    >
                      העתק
                    </button>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleTestPush}
                  disabled={testingPush || !fcmToken}
                  className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-lime text-lime-foreground py-2.5 px-4 text-xs font-bold hover:shadow-md active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {testingPush ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      <span>בודק...</span>
                    </>
                  ) : (
                    <span>בצע התראת ניסיון</span>
                  )}
                </button>

                <button
                  onClick={fcmRequestPermission}
                  disabled={fcmLoading}
                  className="rounded-2xl bg-muted text-foreground py-2.5 px-4 text-xs font-bold hover:bg-muted/70 active:scale-95 transition disabled:opacity-50 cursor-pointer"
                >
                  {fcmLoading ? "טוען..." : "רשום מכשיר"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Order History Section */}
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <h2 className="text-base font-black text-foreground">היסטוריית הזמנות</h2>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-lavender text-lavender-foreground shadow-sm">
              {orders.length} הזמנות
            </span>
          </div>

          {fetchingOrders ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 bg-background/50 rounded-3xl border border-muted-foreground/10">
              <Loader2 className="size-8 text-primary animate-spin" />
              <p className="text-xs text-muted-foreground font-semibold">
                טוען היסטוריית הזמנות...
              </p>
            </div>
          ) : orders.length === 0 ? (
            <div className="rounded-3xl border border-muted-foreground/10 bg-background/50 p-8 text-center flex flex-col items-center gap-3">
              <div className="size-12 rounded-2xl bg-muted/60 grid place-items-center text-muted-foreground">
                <ShoppingBasket className="size-6" strokeWidth={1.5} />
              </div>
              <div>
                <p className="font-extrabold text-sm text-foreground">אין היסטוריית הזמנות</p>
                <p className="text-xs text-muted-foreground mt-1">
                  ההזמנות שתבצע יופיעו כאן בצורה מרוכזת
                </p>
              </div>
            </div>
          ) : (
            <div className="relative">
              <div className="space-y-2 max-h-[18rem] overflow-y-auto pr-1">
                {orders.map((order) => {
                  const date = new Date(order.created_at);
                  const dateString = date.toLocaleDateString("he-IL");
                  const timeString = date.toLocaleTimeString("he-IL", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  const statusBadgeStyle = getStatusBadgeStyle(order.status);
                  return (
                    <button
                      key={order.id}
                      onClick={() => setSelectedOrder(order)}
                      className="w-full text-right rounded-2xl sm:rounded-3xl border border-muted-foreground/10 bg-background/60 hover:bg-muted/30 p-3.5 sm:p-5 flex items-center justify-between transition active:scale-[0.98] shadow-sm group hover:border-primary/20 min-h-[44px]"
                    >
                      <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                        <div className="size-10 sm:size-12 rounded-2xl bg-lavender text-lavender-foreground grid place-items-center flex-shrink-0 group-hover:scale-105 transition-transform duration-300 shadow-sm">
                          <ShoppingBasket className="size-5 sm:size-6" strokeWidth={1.75} />
                        </div>
                        <div className="space-y-0.5 sm:space-y-1 min-w-0">
                          <p className="font-black text-xs sm:text-sm text-foreground truncate">
                            הזמנה #{order.id.slice(0, 8)}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-bold text-muted-foreground">
                              {dateString} ב-{timeString}
                            </span>
                            <span
                              className={`text-[9px] px-2 py-0.5 rounded-full font-black ${statusBadgeStyle}`}
                            >
                              {stateLabel[order.status as keyof typeof stateLabel] || order.status}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                        <span className="text-sm font-black text-foreground">
                          ₪{order.amount_due || order.total_price || 0}
                        </span>
                        <ChevronLeft
                          className="size-5 text-muted-foreground group-hover:text-primary transition-colors"
                          strokeWidth={2.5}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
              {orders.length > 3 && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background to-transparent" />
              )}
            </div>
          )}
        </div>
      </main>

      {/* Order Details Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent
          className="max-w-md w-[95%] sm:w-[92%] max-h-[85vh] overflow-y-auto overflow-x-hidden rounded-2xl sm:rounded-3xl p-4 sm:p-6 text-right dir-rtl backdrop-blur-xl bg-background/95 border-none shadow-[0_25px_60px_rgba(0,0,0,0.2)] focus:outline-none"
          dir="rtl"
        >
          {selectedOrder && (
            <>
              <DialogHeader className="space-y-2 text-right">
                <DialogTitle className="text-lg sm:text-xl font-extrabold text-foreground flex items-center justify-start gap-2">
                  <ShoppingBasket className="size-6 text-primary" />
                  <span>פרטי הזמנה #{selectedOrder.id.slice(0, 8)}</span>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground text-right">
                  בוצעה בתאריך {new Date(selectedOrder.created_at).toLocaleDateString("he-IL")} בשעה{" "}
                  {new Date(selectedOrder.created_at).toLocaleTimeString("he-IL", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 my-4">
                {/* Status Section */}
                <div className="rounded-2xl border border-muted-foreground/10 p-4 space-y-3 bg-muted/20">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-muted-foreground">סטטוס הזמנה:</span>
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-black ${getStatusBadgeStyle(selectedOrder.status)}`}
                    >
                      {stateLabel[selectedOrder.status as keyof typeof stateLabel] ||
                        selectedOrder.status}
                    </span>
                  </div>

                  {/* Visual Status Steps Progress Bar */}
                  <div className="grid grid-cols-5 gap-1.5 pt-2">
                    {["pending", "picked_up", "in_progress", "ready", "completed"].map(
                      (step, idx) => {
                        const steps = ["pending", "picked_up", "in_progress", "ready", "completed"];
                        const currentIdx = steps.indexOf(selectedOrder.status);
                        const isCompleted = idx <= currentIdx;
                        const isActive = step === selectedOrder.status;

                        return (
                          <div key={step} className="space-y-1">
                            <div
                              className={`h-1.5 rounded-full transition-all duration-300 ${
                                isCompleted
                                  ? isActive
                                    ? "bg-primary animate-pulse"
                                    : "bg-lime"
                                  : "bg-muted-foreground/20"
                              }`}
                            />
                            <span
                              className={`text-[8px] font-black block text-center truncate ${
                                isActive ? "text-primary font-black" : "text-muted-foreground"
                              }`}
                            >
                              {step === "pending"
                                ? "התקבלה"
                                : step === "picked_up"
                                  ? "נאספה"
                                  : step === "in_progress"
                                    ? "בטיפול"
                                    : step === "ready"
                                      ? "מוכנה"
                                      : "נמסרה"}
                            </span>
                          </div>
                        );
                      },
                    )}
                  </div>
                </div>

                {/* Pricing & Payment Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-muted-foreground/10 p-4 space-y-1 bg-background/50 shadow-sm">
                    <span className="text-[10px] font-black text-muted-foreground block">
                      מחיר סופי
                    </span>
                    <span className="text-xl font-black text-foreground">
                      ₪{selectedOrder.amount_due || selectedOrder.total_price || 0}
                    </span>
                  </div>
                  <div className="rounded-2xl border border-muted-foreground/10 p-4 space-y-1 bg-background/50 shadow-sm">
                    <span className="text-[10px] font-black text-muted-foreground block">
                      סטטוס תשלום
                    </span>
                    <span
                      className={`text-[11px] px-2.5 py-0.5 rounded-full font-black inline-block mt-1 ${
                        selectedOrder.payment_state === "paid"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}
                    >
                      {selectedOrder.payment_state === "paid" ? "שולם ✓" : "טרם שולם"}
                    </span>
                  </div>
                </div>

                {/* Delivery Method */}
                <div className="rounded-2xl border border-muted-foreground/10 p-4 space-y-1 bg-background/50 shadow-sm">
                  <span className="text-[10px] font-black text-muted-foreground block">
                    שיטת משלוח / מסירה
                  </span>
                  <span className="text-sm font-bold text-foreground">
                    {selectedOrder.delivery_method === "home_delivery"
                      ? "🚚 משלוח עד הבית"
                      : selectedOrder.delivery_method === "self_pickup"
                        ? "🏪 איסוף עצמי מהסניף"
                        : "📍 טרם נבחרה שיטת מסירה"}
                  </span>
                </div>

                {/* Additional services */}
                {(selectedOrder.requires_ironing || selectedOrder.requires_dry_cleaning) && (
                  <div className="rounded-2xl border border-muted-foreground/10 p-4 space-y-2 bg-background/50 shadow-sm">
                    <span className="text-[10px] font-black text-muted-foreground block">
                      שירותים מיוחדים
                    </span>
                    <div className="flex gap-2">
                      {selectedOrder.requires_ironing && (
                        <span className="text-xs font-bold bg-primary/10 text-primary px-3 py-1 rounded-full border border-primary/20">
                          🧺 גיהוץ
                        </span>
                      )}
                      {selectedOrder.requires_dry_cleaning && (
                        <span className="text-xs font-bold bg-primary/10 text-primary px-3 py-1 rounded-full border border-primary/20">
                          ✨ ניקוי יבש
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Notes (Address + special requests) */}
                {selectedOrder.notes && (
                  <div className="rounded-2xl border border-muted-foreground/10 p-4 space-y-2 max-h-48 overflow-y-auto bg-background/50 shadow-sm">
                    <span className="text-[10px] font-black text-muted-foreground block">
                      פרטי איסוף והערות
                    </span>
                    <p className="text-xs leading-relaxed text-foreground whitespace-pre-line font-medium">
                      {selectedOrder.notes}
                    </p>
                  </div>
                )}

                {/* Image gallery if attached */}
                {selectedOrder.images && getImagesArray(selectedOrder.images).length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-muted-foreground block">
                      תמונות שצורפו
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {getImagesArray(selectedOrder.images).map((imgUrl: string, idx: number) => (
                        <div
                          key={idx}
                          className="aspect-square rounded-xl overflow-hidden border border-muted-foreground/10 shadow-sm relative group active:scale-95 transition"
                        >
                          <img
                            src={imgUrl}
                            alt={`פריט ${idx + 1}`}
                            className="size-full object-cover cursor-zoom-in"
                            onClick={() => window.open(imgUrl, "_blank")}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6">
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="w-full rounded-3xl bg-lime text-lime-foreground py-3.5 min-h-[48px] font-bold active:scale-[0.98] transition hover:shadow-lg hover:shadow-lime/20"
                >
                  סגור
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
