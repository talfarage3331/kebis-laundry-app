import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { AdminPricingPanel } from "@/components/AdminPricingPanel";
import { useLaundry, normalizeStatus, type OrderState, ADDONS_META, DELIVERY_TIERS_META } from "@/lib/laundry-store";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, doc, updateDoc } from "firebase/firestore";
import {
  LogOut,
  RefreshCw,
  MessageSquare,
  ChevronDown,
  Save,
  Trash2,
  X,
  MessageSquareText,
  ArrowRight,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/laundry-dashboard")({
  component: LaundryDashboard,
});

interface LaundryOrder {
  id: string;
  created_at: string;
  status: OrderState;
  delivery_method: string;
  payment_state: string;
  amount_due: number;
  price?: number;
  basePrice?: number;
  user_email: string;
  userId: string;
  notes?: string;
  deliveryNotes?: string;
  images?: string[];
  requires_ironing?: boolean;
  requires_dry_cleaning?: boolean;
  requires_washing?: boolean;
  invoices?: Array<{ id: string; date: string; name: string; data: string }>;
  addons?: string[];
  deliveryTier?: string;
}

/* ─── status helpers ─────────────────────────────────────────────── */
function getStatusLabel(status: string) {
  const map: Record<string, string> = {
    pending: "ממתין",
    accepted: "התקבל",
    collected: "נאסף",
    ready: "מוכן",
    delivered: "נמסר",
    cancelled: "בוטלה",
  };
  return map[status] ?? status;
}

function getStatusColor(status: string) {
  const map: Record<string, string> = {
    pending:   "bg-purple-100 text-purple-800 border-purple-200",
    accepted:  "bg-blue-100   text-blue-800   border-blue-200",
    collected: "bg-amber-100  text-amber-800  border-amber-200",
    ready:     "bg-lime/30    text-lime-foreground border-lime/40",
    delivered: "bg-slate-100  text-slate-600  border-slate-200",
    cancelled: "bg-red-100    text-red-700    border-red-200",
  };
  return map[status] ?? "bg-muted text-muted-foreground border-muted-foreground/10";
}

/* ─── safe date helper ──────────────────────────────────────────── */
/**
 * Converts a Firestore field value to a safe ISO string.
 * Handles: ISO strings, Firestore Timestamp objects ({ seconds, nanoseconds }),
 * and anything else (falls back to current time to avoid crashes).
 */
function safeIso(val: any): string {
  if (!val) return new Date().toISOString();
  // Firestore Timestamp object from the Web SDK (has .toDate())
  if (val && typeof val === "object" && typeof val.toDate === "function") {
    try { return val.toDate().toISOString(); } catch { return new Date().toISOString(); }
  }
  // Firestore Timestamp REST shape: { seconds: number, nanoseconds: number }
  if (val && typeof val === "object" && typeof val.seconds === "number") {
    return new Date(val.seconds * 1000).toISOString();
  }
  // Attempt to parse as-is
  const d = new Date(val);
  if (!isNaN(d.getTime())) return d.toISOString();
  return new Date().toISOString();
}

/* ─── main component ─────────────────────────────────────────────── */
function LaundryDashboard() {
  const { user, logout } = useLaundry();
  const navigate = useNavigate();

  const [orders, setOrders]                           = useState<LaundryOrder[]>([]);
  const [isLoading, setIsLoading]                     = useState(true);
  const [activeTab, setActiveTab]                     = useState("active");
  const [typedPrices, setTypedPrices]                 = useState<Record<string, string>>({});
  const [typedMessages, setTypedMessages]             = useState<Record<string, string>>({});
  const [typedDeliveryNotes, setTypedDeliveryNotes]   = useState<Record<string, string>>({});
  const [pendingStatuses, setPendingStatuses]         = useState<Record<string, string>>({});
  const [pendingInvoices, setPendingInvoices]         = useState<Record<string, File | null>>({});
  const [savingOrder, setSavingOrder]                 = useState<Record<string, boolean>>({});
  const [unreadChatCount, setUnreadChatCount]         = useState(0);
  const [expandedOrderId, setExpandedOrderId]         = useState<string | null>(null);
  const [subFilter, setSubFilter]                     = useState<"all" | "treatment" | "ready">("all");
  const [viewMode, setViewMode]                       = useState<"workboard" | "summary">("workboard");
  const [selectedMonth, setSelectedMonth]             = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const getAvailableMonths = () => {
    const HEBREW_MONTHS = [
      "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
      "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"
    ];

    let oldestDate = new Date();
    if (orders.length > 0) {
      orders.forEach((o) => {
        try {
          if (o?.created_at) {
            const d = new Date(o.created_at);
            if (!isNaN(d.getTime()) && d < oldestDate) {
              oldestDate = d;
            }
          }
        } catch { /* skip malformed date */ }
      });
    }

    const options = [];
    const now = new Date();
    let curr = new Date(oldestDate.getFullYear(), oldestDate.getMonth(), 1);
    const targetEnd = new Date(now.getFullYear(), now.getMonth(), 1);

    while (curr <= targetEnd) {
      const y = curr.getFullYear();
      const m = curr.getMonth();
      const val = `${y}-${String(m + 1).padStart(2, "0")}`;
      options.unshift({
        value: val,
        label: `${HEBREW_MONTHS[m]} ${y}`
      });
      curr.setMonth(curr.getMonth() + 1);
    }

    const currentVal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    if (!options.some(opt => opt.value === currentVal)) {
      options.unshift({
        value: currentVal,
        label: `${HEBREW_MONTHS[now.getMonth()]} ${now.getFullYear()}`
      });
    }

    return options;
  };

  const monthlyOrders = orders.filter((o) => {
    try { return o?.created_at && String(o.created_at).startsWith(selectedMonth); } catch { return false; }
  });
  const completedMonthlyOrders = monthlyOrders.filter((o) => o?.status === "delivered");
  const totalMonthlyRevenue = completedMonthlyOrders.reduce((sum, o) => sum + (Number(o?.price) || Number(o?.amount_due) || 0), 0);
  const totalMonthlyOrders = monthlyOrders.length;
  const avgMonthlyOrderValue = totalMonthlyOrders > 0
    ? monthlyOrders.reduce((sum, o) => sum + (Number(o?.price) || Number(o?.amount_due) || 0), 0) / totalMonthlyOrders
    : 0;
  const canceledMonthlyOrdersCount = monthlyOrders.filter((o) => o?.status === "cancelled").length;

  const customerStatsMap: Record<string, { email: string; orderCount: number; totalPaid: number }> = {};
  try {
    monthlyOrders.forEach((o) => {
      const email = o?.user_email || "אורח";
      if (!customerStatsMap[email]) {
        customerStatsMap[email] = { email, orderCount: 0, totalPaid: 0 };
      }
      customerStatsMap[email].orderCount += 1;
      if (o?.status === "delivered") {
        customerStatsMap[email].totalPaid += (Number(o?.price) || Number(o?.amount_due) || 0);
      }
    });
  } catch (statsErr) {
    console.error("[laundry-dashboard] customer stats computation error:", statsErr);
  }
  const activeCustomers = Object.values(customerStatsMap).sort((a, b) => b.orderCount - a.orderCount);

  /* unread chat count */
  useEffect(() => {
    if (!user?.email) return;
    const q = query(collection(db, "chats"));
    const unsub = onSnapshot(q, (snapshot) => {
      let count = 0;
      snapshot.docs.forEach((d) => { if (d.data().unreadCount) count += d.data().unreadCount; });
      setUnreadChatCount(count);
    });
    return () => unsub();
  }, [user?.email]);

  /* orders real-time listener */
  useEffect(() => {
    setIsLoading(true);
    const q = query(collection(db, "orders"));
    const unsub = onSnapshot(q, (snapshot) => {
      const realOrders = snapshot.docs.map((docSnap) => {
        try {
          const o = docSnap.data() ?? {};
          let parsedImages: string[] = [];
          const rawImages = o.images;
          if (Array.isArray(rawImages)) {
            parsedImages = rawImages.filter((img: any) => typeof img === "string");
          } else if (typeof rawImages === "string" && rawImages) {
            try { const parsed = JSON.parse(rawImages); parsedImages = Array.isArray(parsed) ? parsed : []; } catch { parsedImages = []; }
          }
          const createdAt = safeIso(o.created_at ?? o.createdAt);
          return {
            id: docSnap.id,
            created_at: createdAt,
            status: normalizeStatus(o.status),
            delivery_method: o.delivery_method ?? o.deliveryMethod ?? "none",
            payment_state: o.payment_state ?? o.paymentState ?? "unpaid",
            amount_due: Number(o.price ?? o.amount_due ?? o.amountDue ?? 0) || 0,
            price:      Number(o.price ?? o.amount_due ?? o.amountDue ?? 0) || 0,
            user_email: o.user_email ?? o.userEmail ?? "",
            userId:     o.user_id  ?? o.userId  ?? "",
            notes:            o.notes ?? "",
            deliveryNotes:    o.deliveryNotes ?? o.delivery_notes ?? "",
            images:           parsedImages,
            requires_ironing:     !!(o.requires_ironing || o.requiresIroning),
            requires_dry_cleaning:!!(o.requires_dry_cleaning || o.requiresDryCleaning),
            requires_washing:     !!(o.requires_washing || o.requiresWashing),
            invoices: o.invoiceUrl
              ? [{ id: `inv-${docSnap.id}`, date: createdAt, name: o.invoiceName ?? "invoice.pdf", data: o.invoiceUrl }]
              : [],
            addons:           Array.isArray(o.addons) ? o.addons : [],
            deliveryTier:     o.deliveryTier || "standard",
            basePrice:        o.basePrice !== undefined ? Number(o.basePrice) : undefined,
          } as LaundryOrder;
        } catch (docErr) {
          console.error(`[laundry-dashboard] failed to parse order doc ${docSnap.id}:`, docErr);
          return null;
        }
      }).filter((o): o is LaundryOrder => o !== null && o.delivery_method !== "placeholder" && !o.id.startsWith("placeholder"));

      realOrders.sort((a, b) => {
        try {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        } catch { return 0; }
      });
      setOrders(realOrders as any);
      setIsLoading(false);
    }, (err) => {
      console.error("Firestore orders listen error:", err);
      setIsLoading(false);
    });

    const onStorage = () => {
      try {
        const raw = localStorage.getItem("laundry_notifications") || "[]";
        const notifications = JSON.parse(raw);
        if (Array.isArray(notifications) && notifications.length > 0) {
          const latest = notifications[0];
          const seenId = sessionStorage.getItem("last_notified_id");
          if (latest?.id && seenId !== latest.id) {
            sessionStorage.setItem("last_notified_id", latest.id);
            toast.info(`🔔 הזמנה חדשה התקבלה מ-${latest?.user_email ?? ""}!`, { description: latest?.notes ?? "" });
          }
        }
      } catch (storageErr) {
        console.warn("[laundry-dashboard] onStorage parse error:", storageErr);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => { unsub(); window.removeEventListener("storage", onStorage); };
  }, []);

  /* ── Firestore helpers ──────────────────────────────────────────── */
  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, "orders", orderId), { status: newStatus });
      toast.success("סטטוס ההזמנה עודכן בהצלחה!");
    } catch (err: any) { toast.error("שגיאה בעדכון הסטטוס: " + err.message); }
  };

  const updateOrderPrice = async (orderId: string, newPrice: number, basePrice: number) => {
    try {
      await updateDoc(doc(db, "orders", orderId), { price: newPrice, amount_due: newPrice, amountDue: newPrice, total_price: newPrice, basePrice: basePrice });
      toast.success("מחיר ההזמנה עודכן בהצלחה!");
    } catch (err: any) { toast.error("שגיאה בעדכון המחיר: " + err.message); }
  };

  const updateOrderDeliveryNotes = async (orderId: string, notes: string) => {
    try {
      await updateDoc(doc(db, "orders", orderId), { deliveryNotes: notes, delivery_notes: notes });
    } catch (err: any) { toast.error("שגיאה בעדכון הערות משלוח: " + err.message); }
  };

  const updateOrderMessage = async (orderId: string, newMessage: string) => {
    try {
      const targetOrder = orders.find((o) => o.id === orderId);
      const [custNotes] = (targetOrder?.notes || "").split(" ||LAUNDRY_MSG|| ");
      const combined = custNotes.trim() + " ||LAUNDRY_MSG|| " + newMessage.trim();
      await updateDoc(doc(db, "orders", orderId), { notes: combined });
      toast.success("הודעת המכבסה עודכנה בהצלחה!");
    } catch (err: any) { toast.error("שגיאה בעדכון ההודעה: " + err.message); }
  };

  const uploadInvoice = async (orderId: string, file: File) => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("https://tmpfiles.org/api/v1/upload", { method: "POST", body: formData });
      if (!response.ok) throw new Error(`Upload server responded with status: ${response.status}`);
      const resJson = await response.json();
      if (resJson.status !== "success" || !resJson.data?.url) throw new Error(resJson.message || "Failed to parse file upload response.");
      const directDownloadUrl = resJson.data.url.replace("https://tmpfiles.org/", "https://tmpfiles.org/dl/");
      await updateDoc(doc(db, "orders", orderId), { invoiceUrl: directDownloadUrl, invoiceName: file.name });
      toast.success("החשבונית הועלתה בהצלחה ונשלחה ללקוח!");
    } catch (err: any) {
      toast.error("שגיאה בהעלאת חשבונית: " + err.message);
      console.error("Invoice upload error:", err);
    }
  };

  const sendPushEvent = async (customerEmail: string, customerUserId: string, event: string, options?: { customBody?: string; customTitle?: string }) => {
    try {
      const res = await fetch("/api/push/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userEmail: customerEmail, userId: customerUserId, event, ...options }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { console.warn(`[push] /api/push/notify failed:`, data?.error); return; }
      if (data?.failed > 0) toast.warning(`הזמנה עודכנה, אך שליחת התראת הפוש נכשלה.`);
      else if (data?.sent === 0) toast.warning("הזמנה עודכנה, אך ללקוח זה אין מכשירים רשומים.");
      else toast.success("התראת פוש נשלחה בהצלחה ללקוח!");
    } catch (err: any) {
      console.error("[push] Failed to reach /api/push/notify:", err);
    }
  };

  const saveAllChanges = async (orderId: string) => {
    setSavingOrder((prev) => ({ ...prev, [orderId]: true }));
    try {
      const currentOrder = orders.find((o) => o.id === orderId);

      const priceVal = typedPrices[orderId];
      if (priceVal !== undefined && priceVal !== "") {
        const basePriceNum = Number(priceVal);
        const addonsPriceSum = (currentOrder?.addons || []).reduce(
          (sum: number, key: string) => sum + (ADDONS_META[key]?.price || 0),
          0
        );
        const deliveryTierPrice = currentOrder?.delivery_method === "home_delivery"
          ? (DELIVERY_TIERS_META[currentOrder?.deliveryTier || "standard"]?.price || 0)
          : 0;
        const finalPriceNum = basePriceNum + addonsPriceSum + deliveryTierPrice;
        await updateOrderPrice(orderId, finalPriceNum, basePriceNum);
      }

      const newStatus = pendingStatuses[orderId];
      if (newStatus && newStatus !== currentOrder?.status) {
        await updateOrderStatus(orderId, newStatus);
        const STATUS_PUSH_MAP: Record<string, { event: string; title: string; body: string }> = {
          pending:   { event: "laundry-picked-up",   title: "ההזמנה ממתינה 🧺",          body: "ההזמנה שלך נמצאת בסטטוס ממתין" },
          accepted:  { event: "laundry-picked-up",   title: "ההזמנה התקבלה במכבסה 🧺",  body: "ההזמנה שלך התקבלה ע״י המכבסה" },
          collected: { event: "laundry-picked-up",   title: "הכביסה נאספה 🧺",           body: "הכביסה שלך נאספה בהצלחה" },
          ready:     { event: "laundry-ready",       title: "הכביסה שלך מוכנה! 🧺",     body: "ההזמנה שלך מוכנה. ניתן לתאם איסוף או משלוח" },
          delivered: { event: "laundry-delivered",   title: "הכביסה נמסרה בהצלחה 🎉",   body: "הכביסה שלך נמסרה בהצלחה" },
          cancelled: { event: "laundry-delivered",   title: "ההזמנה בוטלה",              body: "ההזמנה שלך בוטלה" },
        };
        const pushSpec = STATUS_PUSH_MAP[newStatus];
        if (currentOrder?.user_email && pushSpec) {
          await sendPushEvent(currentOrder.user_email, currentOrder.userId || "", pushSpec.event, { customTitle: pushSpec.title, customBody: pushSpec.body });
        }
      }

      const newMessage = typedMessages[orderId];
      if (newMessage !== undefined && newMessage.trim() !== "") {
        await updateOrderMessage(orderId, newMessage);
        if (currentOrder?.user_email) {
          await sendPushEvent(currentOrder.user_email, currentOrder.userId || "", "chat-to-customer", {
            customBody: `צוות המכבסה: ${newMessage.trim().substring(0, 60)}${newMessage.trim().length > 60 ? "..." : ""}`,
          });
        }
      }

      const delNotes = typedDeliveryNotes[orderId];
      if (delNotes !== undefined) await updateOrderDeliveryNotes(orderId, delNotes);

      const invoiceFile = pendingInvoices[orderId];
      if (invoiceFile) {
        await uploadInvoice(orderId, invoiceFile);
        setPendingInvoices((prev) => { const n = { ...prev }; delete n[orderId]; return n; });
        if (currentOrder?.user_email) {
          await sendPushEvent(currentOrder.user_email, currentOrder.userId || "", "invoice-ready", {
            customTitle: "החשבונית שלך זמינה באפליקציה 📄",
            customBody:  "החשבונית שלך הועלתה ומוכנה לצפייה ולהורדה בעמוד התשלומים",
          });
        }
      }

      if (priceVal !== undefined && priceVal !== "") {
        if (currentOrder?.user_email) {
          await sendPushEvent(currentOrder.user_email, currentOrder.userId || "", "price-updated", {
            customTitle: "עודכן מחיר סופי להזמנה שלך",
            customBody:  `נקבע מחיר סופי להזמנה שלך: ₪${Number(priceVal).toLocaleString("he-IL")} — ניתן לראות פרטים בעמוד התשלומים`,
          });
        }
      }

      toast.success("✅ כל השינויים נשמרו ועודכנו אצל הלקוח!");
    } catch (err: any) {
      toast.error("שגיאה בשמירת השינויים: " + err.message);
    } finally {
      setSavingOrder((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  const deleteUploadedInvoice = async (orderId: string) => {
    if (!confirm("האם אתה בטוח שברצונך למחוק חשבונית זו?")) return;
    try {
      await updateDoc(doc(db, "orders", orderId), { invoiceUrl: "", invoiceName: "" });
      toast.success("החשבונית נמחקה בהצלחה!");
    } catch (err: any) { toast.error("שגיאה במחיקת החשבונית: " + err.message); }
  };

  const deleteOrderImage = async (orderId: string, imageUrl: string) => {
    if (!confirm("האם אתה בטוח שברצונך למחוק תמונה זו מההזמנה?")) return;
    try {
      const targetOrder = orders.find((o) => o.id === orderId);
      if (!targetOrder) { toast.error("ההזמנה לא נמצאה"); return; }
      const updatedImages = (targetOrder.images || []).filter((img) => img !== imageUrl);
      await updateDoc(doc(db, "orders", orderId), { images: updatedImages });
      toast.success("התמונה נמחקה בהצלחה מההזמנה!");
    } catch (err: any) { toast.error("שגיאה במחיקת התמונה: " + err.message); }
  };

  /* ── filtering ──────────────────────────────────────────────────── */
  const filteredOrders = orders.filter((o) => {
    if (activeTab === "active") {
      if (o.status === "delivered") return false;
      if (subFilter === "treatment") return ["accepted","pending","collected"].includes(o.status);
      if (subFilter === "ready")     return o.status === "ready";
      return true;
    }
    return o.status === "delivered";
  });

  /* ── render ─────────────────────────────────────────────────────── */
  return (
    <AppLayout>
      <div className="min-h-screen bg-background pb-16 dir-rtl text-right overflow-x-hidden" dir="rtl">

        {/* ── Header ───────────────────────────────────────────────── */}
        <header className="bg-lavender px-4 pb-4 sm:px-6 sm:pb-5 pt-safe-lavender rounded-b-[2rem] shadow-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <h1 className="text-lg sm:text-xl font-black text-lavender-foreground whitespace-nowrap">
              צוות מכבסה
            </h1>
            <div className="flex bg-background/50 p-1 rounded-xl border border-muted-foreground/10">
              <button
                onClick={() => setViewMode("workboard")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  viewMode === "workboard"
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                לוח עבודה
              </button>
              <button
                onClick={() => setViewMode("summary")}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  viewMode === "summary"
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                סיכום חודשי
              </button>
            </div>
          </div>
          <button
            onClick={() => { logout(); navigate({ to: "/login" }); }}
            className="size-10 rounded-2xl bg-background/50 hover:bg-background/80 flex items-center justify-center text-destructive transition-colors active:scale-95 shadow-sm"
            title="התנתק"
          >
            <LogOut className="size-4" />
          </button>
        </header>

        <main className="px-3 sm:px-5 mt-4 space-y-3 max-w-full">

          {viewMode === "summary" ? (
            <div className="space-y-4">
              {/* Dynamic Month Selector */}
              <div className="bg-card border border-muted-foreground/10 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                <div>
                  <h2 className="text-sm font-black text-foreground">בחר חודש לצפייה</h2>
                  <p className="text-[10px] text-muted-foreground">הנתונים מתעדכנים אוטומטית ומסוננים לפי החודש הנבחר</p>
                </div>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="h-10 w-full sm:w-48 bg-background border border-muted-foreground/20 rounded-lg px-3 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary text-right"
                >
                  {getAvailableMonths().map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* KPI Cards Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: "סך הכנסות חודשי", value: `₪${totalMonthlyRevenue.toLocaleString("he-IL")}`, color: "text-emerald-600 bg-emerald-50 border-emerald-100" },
                  { label: "סה\"כ הזמנות", value: totalMonthlyOrders, color: "text-blue-600 bg-blue-50 border-blue-100" },
                  { label: "ממוצע להזמנה", value: `₪${Math.round(avgMonthlyOrderValue).toLocaleString("he-IL")}`, color: "text-purple-600 bg-purple-50 border-purple-100" },
                  { label: "הזמנות שבוטלו", value: canceledMonthlyOrdersCount, color: "text-destructive bg-destructive/5 border-destructive/10" },
                ].map((kpi, idx) => (
                  <div key={idx} className={`border rounded-2xl p-4 flex flex-col justify-between shadow-sm min-h-[90px] ${kpi.color}`}>
                    <span className="text-[10px] font-black opacity-75">{kpi.label}</span>
                    <span className="text-lg sm:text-xl font-black mt-2 leading-none">{kpi.value}</span>
                  </div>
                ))}
              </div>

              {/* Active Customers Table */}
              <div className="bg-card border border-muted-foreground/10 rounded-2xl overflow-hidden shadow-sm">
                <div className="p-4 border-b border-muted-foreground/10">
                  <h3 className="text-sm font-black text-foreground">לקוחות שהזמינו החודש ({activeCustomers.length})</h3>
                  <p className="text-[10px] text-muted-foreground">רשימת לקוחות ייחודית עם פירוט פעילות לחודש הנבחר</p>
                </div>
                
                {activeCustomers.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted-foreground">
                    אין פעילות לקוחות בחודש זה.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead>
                        <tr className="bg-muted/30 border-b border-muted-foreground/5 text-muted-foreground font-black text-[10px]">
                          <th className="py-2.5 px-4">שם/אימייל</th>
                          <th className="py-2.5 px-4 text-center">מספר הזמנות החודש</th>
                          <th className="py-2.5 px-4 text-left">סך הכל שולם</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-muted-foreground/5">
                        {activeCustomers.map((c, idx) => (
                          <tr key={idx} className="hover:bg-muted/10 transition-colors">
                            <td className="py-2.5 px-4 font-bold text-foreground truncate max-w-[200px]" title={c.email}>
                              {c.email}
                            </td>
                            <td className="py-2.5 px-4 text-center font-bold text-foreground">
                              {c.orderCount}
                            </td>
                            <td className="py-2.5 px-4 text-left font-black text-emerald-600">
                              ₪{c.totalPaid.toLocaleString("he-IL")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* ── Stats strip ──────────────────────────────────────────── */}
              <section className="grid grid-cols-5 gap-1.5">
                {[
                  { label: "ממתינים", count: orders.filter((o) => o.status === "pending").length,   color: "text-purple-600 bg-purple-50 border-purple-100" },
                  { label: "התקבלו",  count: orders.filter((o) => o.status === "accepted").length,  color: "text-blue-600   bg-blue-50   border-blue-100"   },
                  { label: "נאספו",   count: orders.filter((o) => o.status === "collected").length, color: "text-amber-600  bg-amber-50  border-amber-100"  },
                  { label: "מוכנים",  count: orders.filter((o) => o.status === "ready").length,     color: "text-lime-foreground bg-lime/10 border-lime/20" },
                  { label: "נמסרו",   count: orders.filter((o) => o.status === "delivered").length, color: "text-slate-600  bg-slate-50  border-slate-100"  },
                  { label: "מוכנים",  count: orders.filter((o) => o.status === "ready").length,       color: "text-lime-foreground bg-lime/10 border-lime/20" },
                  { label: "הושלמו",  count: orders.filter((o) => o.status === "delivered").length,   color: "text-slate-600  bg-slate-50  border-slate-100"  },
                ].map((stat, idx) => (
                  <div key={idx} className={`border rounded-xl p-2 flex flex-col items-center text-center ${stat.color}`}>
                    <span className="text-sm font-black leading-none">{stat.count}</span>
                    <span className="text-[9px] font-bold opacity-75 mt-0.5">{stat.label}</span>
                  </div>
                ))}
              </section>

              {/* ── Chat link ────────────────────────────────────────────── */}
              <button
                onClick={() => navigate({ to: "/admin-chat" })}
                className="relative w-full bg-primary/10 border border-primary/20 text-primary hover:bg-primary hover:text-primary-foreground rounded-xl px-4 py-2.5 flex items-center justify-between font-bold text-sm transition-all group active:scale-95"
              >
                <div className="flex items-center gap-2.5">
                  <div className="relative size-8 rounded-full bg-background/50 grid place-items-center group-hover:bg-primary-foreground/20">
                    <MessageSquareText className="size-4" />
                    {unreadChatCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow">
                        {unreadChatCount > 99 ? "99+" : unreadChatCount}
                      </span>
                    )}
                  </div>
                  <span>לוח הודעות (צ׳אט)</span>
                </div>
                <ArrowRight className="size-4 rotate-180 opacity-50 group-hover:opacity-100 group-hover:-translate-x-1 transition-all" />
              </button>

              {/* Pricing management panel */}
              <AdminPricingPanel />

              {/* ── Tabs ─────────────────────────────────────────────────── */}
              <div className="flex gap-1.5">
                {[
                  { key: "active",    label: `פעילות (${orders.filter((o) => o.status !== "delivered").length})` },
                  { key: "delivered", label: `הסטוריה (${orders.filter((o) => o.status === "delivered").length})` },
                ].map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    className={`flex-1 py-2 rounded-xl text-xs font-black transition border active:scale-95 ${
                      activeTab === t.key
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted text-muted-foreground border-muted-foreground/10"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* ── Order list header + sub-filters ──────────────────────── */}
              <div className="flex items-center justify-between gap-2 border-b border-muted-foreground/10 pb-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-extrabold">
                    {activeTab === "active" ? "הזמנות לטיפול" : "הזמנות שהושלמו"}
                  </h2>
                  <button
                    onClick={() => toast.success("הנתונים מסונכרנים בזמן אמת! ✨")}
                    className="size-7 rounded-full hover:bg-muted flex items-center justify-center text-primary transition active:rotate-180 duration-500"
                  >
                    <RefreshCw className="size-3.5" />
                  </button>
                </div>
                {activeTab === "active" && (
                  <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-lg border border-muted-foreground/5">
                    {[
                      { key: "all",       label: "הכל" },
                      { key: "treatment", label: "בטיפול" },
                      { key: "ready",     label: "מוכן" },
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setSubFilter(tab.key as any)}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all duration-200 ${
                          subFilter === tab.key
                            ? "bg-background text-primary shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Order cards ──────────────────────────────────────────── */}
              {isLoading ? (
                <div className="py-16 flex flex-col items-center gap-2">
                  <div className="animate-spin rounded-full size-7 border-4 border-primary border-t-transparent" />
                  <span className="text-xs text-muted-foreground">טוען הזמנות כביסה...</span>
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="bg-muted/30 border border-muted/50 rounded-2xl p-10 text-center text-sm text-muted-foreground">
                  לא נמצאו הזמנות בקטגוריה זו.
                </div>
              ) : (
                <div className="space-y-1.5 pb-4">
                  {filteredOrders.map((order) => {
                    const isExpanded = expandedOrderId === order.id;
                    const [custNotes, laundryMsg] = (order.notes || "").split(" ||LAUNDRY_MSG|| ");
                    const displayPrice = order.price !== undefined ? order.price : order.amount_due;
                    const isCancelled = order.status === "cancelled";

                    return (
                      <div
                        key={order.id}
                        className={`bg-card border rounded-xl transition-all duration-200 overflow-hidden ${
                          isCancelled
                            ? "border-destructive/30 ring-1 ring-destructive/10 bg-muted/30 opacity-80"
                            : isExpanded
                              ? "border-primary/30 shadow-md ring-1 ring-primary/10"
                              : "border-muted-foreground/10 hover:border-muted-foreground/25 hover:shadow-sm cursor-pointer"
                        }`}
                        onClick={() => { if (!isExpanded) setExpandedOrderId(order.id); }}
                      >
                        {/* ── Slim collapsed row ───────────────────────── */}
                        <div
                          className="flex items-center justify-between gap-2 py-2.5 px-4 select-none"
                          onClick={(e) => {
                            if (isExpanded) { e.stopPropagation(); setExpandedOrderId(null); }
                          }}
                        >
                          {/* Right: chevron + status + ID */}
                          <div className="flex items-center gap-2 min-w-0 shrink-0">
                            <div
                              className="p-0.5 rounded cursor-pointer"
                              onClick={(e) => { e.stopPropagation(); setExpandedOrderId(isExpanded ? null : order.id); }}
                            >
                              <ChevronDown
                                className={`size-4 text-muted-foreground transition-transform duration-300 ${isExpanded ? "rotate-180 text-primary" : ""}`}
                              />
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${getStatusColor(order.status)}`}>
                              {getStatusLabel(order.status)}
                            </span>
                            <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-muted-foreground/5 hidden sm:inline">
                              #{order.id.slice(0, 8)}
                            </span>
                          </div>

                          {/* Center: email & date inline */}
                          <div className="flex-1 min-w-0 px-3 flex items-center justify-between gap-3 text-right">
                            <span className="text-xs font-extrabold truncate text-foreground" title={order.user_email}>
                              {order.user_email}
                            </span>
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap hidden sm:inline-block">
                              {new Date(order.created_at).toLocaleDateString("he-IL")}
                            </span>
                          </div>

                          {/* Left: price */}
                          <div className="shrink-0 text-left">
                            <span className="text-sm font-black text-foreground">
                              {displayPrice !== undefined && displayPrice !== 0
                                ? `₪${displayPrice}`
                                : <span className="text-[10px] text-muted-foreground font-semibold">טרם נקבע</span>
                              }
                            </span>
                          </div>
                        </div>

                        {/* ── Expanded panel ───────────────────────────── */}
                        <div
                          className={`grid transition-all duration-300 ease-in-out ${
                            isExpanded
                              ? "grid-rows-[1fr] opacity-100"
                              : "grid-rows-[0fr] opacity-0"
                          }`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="overflow-hidden">
                            <div className="border-t border-muted-foreground/10 mx-4" />
                            <div className="px-4 pt-3 pb-4">

                              {isCancelled && (
                                <div className="mb-3 rounded-xl border-2 border-destructive/40 bg-destructive/10 text-destructive px-4 py-3 flex items-center gap-2">
                                  <XCircle className="size-5 shrink-0" />
                                  <div className="text-right">
                                    <p className="text-xs font-black">הזמנה זו בוטלה</p>
                                    <p className="text-[10px] font-semibold opacity-80">לא ניתן לערוך פרטים, סטטוס או חשבונית.</p>
                                  </div>
                                </div>
                              )}

                              {/* 3-column grid */}
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4" dir="rtl">

                                {/* ── Col 1: Context (read-only typography) ── */}
                                <div className="space-y-3">
                                  <h4 className="text-[10px] font-black text-primary uppercase tracking-widest">
                                    פרטי לקוח
                                  </h4>

                                  {/* Customer info */}
                                  <div className="space-y-1 text-xs">
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">לקוח:</span>
                                      <span className="font-semibold text-foreground break-all text-left">{order.user_email}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">מסירה:</span>
                                      <span className="font-semibold text-foreground">
                                        {order.delivery_method === "home_delivery" ? "משלוח 🚗" : order.delivery_method === "self_pickup" ? "איסוף 🧺" : "טרם נקבע"}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">תאריך:</span>
                                      <span className="font-semibold text-foreground">{new Date(order.created_at).toLocaleString("he-IL")}</span>
                                    </div>
                                  </div>

                                  {/* Services badges */}
                                  {(order.requires_washing || order.requires_ironing || order.requires_dry_cleaning || (order.addons && order.addons.length > 0)) && (
                                    <div className="flex gap-1.5 flex-wrap">
                                      {order.requires_washing && (
                                        <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-black px-2 py-0.5 rounded-full">כביסה 👕</span>
                                      )}
                                      {order.requires_ironing && (
                                        <span className="bg-primary/10 text-primary border border-primary/20 text-[10px] font-black px-2 py-0.5 rounded-full">גיהוץ 🧺</span>
                                      )}
                                      {order.requires_dry_cleaning && (
                                        <span className="bg-lime/20 text-lime-foreground border border-lime-foreground/20 text-[10px] font-black px-2 py-0.5 rounded-full">ניקוי יבש ✨</span>
                                      )}
                                      {order.addons?.map((key) => {
                                        const m = ADDONS_META[key];
                                        if (!m) return null;
                                        return (
                                          <span key={key} className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-black px-2 py-0.5 rounded-full">
                                            {m.label} (+₪{m.price})
                                          </span>
                                        );
                                      })}
                                      {order.delivery_method === "home_delivery" && order.deliveryTier && (
                                        <span className="bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-black px-2 py-0.5 rounded-full">
                                          {DELIVERY_TIERS_META[order.deliveryTier]?.label} (+₪{DELIVERY_TIERS_META[order.deliveryTier]?.price})
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {/* Customer notes/address — plain typography, no textarea */}
                                  {custNotes?.trim() && (
                                    <div>
                                      <p className="text-[10px] font-black text-muted-foreground mb-0.5">כתובת והנחיות:</p>
                                      <p className="text-[11px] text-foreground leading-relaxed bg-muted/40 rounded-lg px-2.5 py-2 border border-muted-foreground/10 whitespace-pre-wrap">
                                        {custNotes.trim()}
                                      </p>
                                    </div>
                                  )}

                                  {/* Last laundry message sent */}
                                  {laundryMsg?.trim() && (
                                    <div>
                                      <p className="text-[10px] font-black text-lime-foreground mb-0.5 flex items-center gap-1">
                                        <MessageSquare className="size-3" /> הודעה אחרונה שנשלחה:
                                      </p>
                                      <p className="text-[11px] text-foreground leading-relaxed bg-lime/10 rounded-lg px-2.5 py-2 border border-lime/20 whitespace-pre-wrap">
                                        {laundryMsg.trim()}
                                      </p>
                                    </div>
                                  )}

                                  {/* Image thumbnails */}
                                  {order.images && order.images.length > 0 && (
                                    <div>
                                      <p className="text-[10px] font-black text-muted-foreground mb-1">תמונות:</p>
                                      <div className="flex gap-1.5 flex-wrap">
                                        {order.images.map((img, idx) => (
                                          <div key={idx} className="relative size-12 rounded-lg overflow-hidden border border-muted-foreground/10 group shrink-0">
                                            <img
                                              src={img}
                                              alt="תצוגה"
                                              className="size-full object-cover cursor-pointer"
                                              onClick={() => { const w = window.open(); if (w) w.document.write(`<img src="${img}" style="max-width:100%;max-height:100vh;display:block;margin:auto" />`); }}
                                            />
                                            <button
                                              type="button"
                                              onClick={(e) => { e.stopPropagation(); deleteOrderImage(order.id, img); }}
                                              className="absolute top-0.5 left-0.5 bg-destructive/90 text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
                                            >
                                              <Trash2 className="size-2.5" />
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* ── Col 2: Controls ─────────────────────── */}
                                <div className="space-y-3">
                                  <h4 className="text-[10px] font-black text-primary uppercase tracking-widest">
                                    עדכונים
                                  </h4>

                                  {/* Price input */}
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-black text-foreground flex items-center justify-between">
                                      <span>מחיר בסיס (₪)</span>
                                      <span className="text-muted-foreground font-semibold">
                                        נוכחי: {order.basePrice !== undefined && order.basePrice !== 0 ? `₪${order.basePrice}` : "—"}
                                      </span>
                                    </label>
                                    <input
                                      type="number"
                                      disabled={isCancelled}
                                      value={typedPrices[order.id] !== undefined ? typedPrices[order.id] : String(order.basePrice !== undefined ? order.basePrice : "")}
                                      onChange={(e) => setTypedPrices((prev) => ({ ...prev, [order.id]: e.target.value }))}
                                      placeholder="מחיר בסיס"
                                      className="h-10 w-full max-w-xs bg-background border border-muted-foreground/20 rounded-lg px-3 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed text-right"
                                    />

                                    {/* Real-time Math Summary */}
                                    <div className="mt-2 p-2.5 rounded-lg bg-muted/40 border border-muted-foreground/10 text-[10px] font-semibold space-y-1 max-w-xs text-right">
                                      <div className="flex justify-between">
                                        <span>מחיר בסיס:</span>
                                        <span>₪{Number(typedPrices[order.id] !== undefined ? typedPrices[order.id] : (order.basePrice ?? 0)) || 0}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>שדרוגי כביסה (+):</span>
                                        <span>₪{(order.addons || []).reduce((sum: number, key: string) => sum + (ADDONS_META[key]?.price || 0), 0)}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span>דמי משלוח (+):</span>
                                        <span>₪{order.delivery_method === "home_delivery" ? (DELIVERY_TIERS_META[order.deliveryTier || "standard"]?.price || 0) : 0}</span>
                                      </div>
                                      <div className="border-t border-muted-foreground/20 pt-1 flex justify-between font-black text-primary text-xs">
                                        <span>מחיר סופי ללקוח:</span>
                                        <span>
                                          ₪{(Number(typedPrices[order.id] !== undefined ? typedPrices[order.id] : (order.basePrice ?? 0)) || 0) +
                                            (order.addons || []).reduce((sum: number, key: string) => sum + (ADDONS_META[key]?.price || 0), 0) +
                                            (order.delivery_method === "home_delivery" ? (DELIVERY_TIERS_META[order.deliveryTier || "standard"]?.price || 0) : 0)}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Status dropdown — options conditional on delivery method */}
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-black text-foreground block">סטטוס טיפול</label>
                                    <select
                                      disabled={isCancelled}
                                      value={pendingStatuses[order.id] || order.status}
                                      onChange={(e) => setPendingStatuses((prev) => ({ ...prev, [order.id]: e.target.value }))}
                                      className="h-10 w-full max-w-xs bg-background border border-muted-foreground/20 rounded-lg px-3 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary text-right disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      <option value="pending">ממתין</option>
                                      <option value="accepted">התקבל</option>
                                      <option value="collected">נאסף</option>
                                      <option value="ready">מוכן</option>
                                      {/* "delivered" only relevant for home delivery */}
                                      {order.delivery_method !== "self_pickup" && (
                                        <option value="delivered">נמסר</option>
                                      )}
                                      <option value="cancelled">בוטלה</option>
                                    </select>
                                    {/* Visual hint for self-pickup */}
                                    {order.delivery_method === "self_pickup" && (
                                      <p className="text-[9px] text-muted-foreground mt-0.5">
                                        איסוף עצמי — המסלול מסתיים במצב מוכן
                                      </p>
                                    )}
                                  </div>

                                  {/* Delivery notes */}
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-black text-foreground block">הערות לשליח</label>
                                    <textarea
                                      rows={3}
                                      disabled={isCancelled}
                                      value={typedDeliveryNotes[order.id] !== undefined ? typedDeliveryNotes[order.id] : order.deliveryNotes || ""}
                                      onChange={(e) => setTypedDeliveryNotes((prev) => ({ ...prev, [order.id]: e.target.value }))}
                                      placeholder="כתובת מפורטת, קוד כניסה..."
                                      className="w-full max-w-xs bg-background border border-muted-foreground/20 rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary resize-none leading-relaxed disabled:opacity-50 disabled:cursor-not-allowed"
                                    />
                                  </div>
                                </div>

                                {/* ── Col 3: Actions ──────────────────────── */}
                                <div className="space-y-3">
                                  <h4 className="text-[10px] font-black text-primary uppercase tracking-widest">
                                    פעולות
                                  </h4>

                                  {/* Message to customer */}
                                  <div className="space-y-1">
                                    <label className="text-[10px] font-black text-foreground block">הודעה ללקוח</label>
                                    <textarea
                                      rows={3}
                                      disabled={isCancelled}
                                      value={
                                        typedMessages[order.id] !== undefined
                                          ? typedMessages[order.id]
                                          : (() => { const [, msg] = (order.notes || "").split(" ||LAUNDRY_MSG|| "); return msg || ""; })()
                                      }
                                      onChange={(e) => setTypedMessages((prev) => ({ ...prev, [order.id]: e.target.value }))}
                                      placeholder="הקלד הודעה ללקוח..."
                                      className="w-full bg-background border border-muted-foreground/20 rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary resize-none leading-relaxed disabled:opacity-50 disabled:cursor-not-allowed"
                                    />
                                  </div>

                                  {/* Invoice uploader */}
                                  <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-foreground block">חשבונית</label>

                                    {/* Existing invoices */}
                                    {order.invoices && order.invoices.length > 0 && (
                                      <div className="space-y-1">
                                        {order.invoices.map((inv, idx) => (
                                          <div key={idx} className="flex items-center justify-between bg-muted/30 rounded-lg px-2.5 py-1.5 border border-muted-foreground/10 gap-1">
                                            <span className="text-[10px] font-bold truncate max-w-[120px]" title={inv.name}>📄 {inv.name}</span>
                                            <div className="flex items-center gap-1 shrink-0">
                                              <a href={inv.data} download={inv.name} className="text-[10px] font-black text-primary bg-primary/10 px-2 py-0.5 rounded-md hover:bg-primary/20 transition">
                                                הורד
                                              </a>
                                              <button
                                                type="button"
                                                onClick={() => deleteUploadedInvoice(order.id)}
                                                className="text-[10px] font-black text-destructive bg-destructive/10 px-2 py-0.5 rounded-md hover:bg-destructive/20 transition flex items-center gap-0.5"
                                              >
                                                <Trash2 className="size-2.5" /> מחק
                                              </button>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {/* File input */}
                                    <input
                                      type="file"
                                      disabled={isCancelled}
                                      accept="application/pdf,image/*"
                                      className="text-[10px] block w-full text-muted-foreground
                                        file:ml-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0
                                        file:text-[10px] file:font-bold file:bg-primary file:text-primary-foreground
                                        hover:file:bg-primary/90 file:cursor-pointer cursor-pointer transition disabled:opacity-50 disabled:cursor-not-allowed"
                                      onChange={(e) => {
                                        if (e.target.files && e.target.files[0]) {
                                          setPendingInvoices((prev) => ({ ...prev, [order.id]: e.target.files![0] }));
                                          toast.info(`קובץ "${e.target.files[0].name}" נבחר — לחץ שמור לשליחה`);
                                        }
                                      }}
                                    />

                                    {/* Pending file preview */}
                                    {pendingInvoices[order.id] && (
                                      <div className="flex items-center justify-between bg-primary/5 rounded-lg px-2.5 py-1.5 border border-primary/10 gap-1">
                                        <p className="text-[10px] text-primary font-bold truncate flex-1">📎 {pendingInvoices[order.id]!.name}</p>
                                        <button
                                          type="button"
                                          onClick={() => setPendingInvoices((prev) => { const n = { ...prev }; delete n[order.id]; return n; })}
                                          className="text-destructive hover:text-destructive/80 font-black flex items-center gap-0.5 text-[10px] bg-destructive/10 px-1.5 py-0.5 rounded-md transition shrink-0"
                                        >
                                          <X className="size-2.5" /> בטל
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>{/* /grid */}

                              {/* ── Action buttons (admin) ── */}
                              <div className="mt-4 pt-3 border-t border-muted-foreground/10 flex justify-between items-center gap-2">
                                {order.status !== "cancelled" ? (
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <button
                                        className="inline-flex items-center justify-center gap-1.5 px-4 text-[11px] font-black rounded-full border-2 border-destructive/40 text-destructive bg-destructive/5 hover:bg-destructive/10 active:scale-[0.97] transition h-10"
                                      >
                                        <XCircle className="size-3.5" />
                                        <span>בטל הזמנה</span>
                                      </button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent dir="rtl" className="text-right">
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>לבטל הזמנה זו?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                          ביטול הזמנה ע״י המכבסה תקף בכל סטטוס. הפעולה אינה הפיכה.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>חזור</AlertDialogCancel>
                                        <AlertDialogAction
                                          onClick={async () => {
                                            await updateOrderStatus(order.id, "cancelled");
                                          }}
                                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        >
                                          בטל הזמנה
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                ) : (
                                  <span className="text-[11px] font-bold text-destructive">הזמנה זו בוטלה</span>
                                )}
                                {!isCancelled && (
                                  <button
                                    onClick={() => saveAllChanges(order.id)}
                                    disabled={savingOrder[order.id]}
                                    className="inline-flex items-center justify-center gap-2 px-6 bg-primary text-primary-foreground text-xs font-black rounded-full hover:bg-primary/90 hover:shadow-md hover:shadow-primary/20 active:scale-[0.97] transition disabled:opacity-60 disabled:cursor-not-allowed h-10"
                                  >
                                    {savingOrder[order.id] ? (
                                      <>
                                        <div className="animate-spin rounded-full size-3.5 border-2 border-primary-foreground border-t-transparent" />
                                        <span>שומר...</span>
                                      </>
                                    ) : (
                                      <>
                                        <Save className="size-3.5" />
                                        <span>שמור שינויים</span>
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>

                            </div>{/* /inner */}
                          </div>
                        </div>{/* /accordion */}

                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

        </main>
      </div>
    </AppLayout>
  );
}
