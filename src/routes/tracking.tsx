import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { AppHeader } from "@/components/AppHeader";
import { useLaundry, stateLabel, getOrderSteps, normalizeStatus, ADDONS_META, DELIVERY_TIERS_META } from "@/lib/laundry-store";
import { useLaundryOptions } from "@/hooks/use-laundry-options";
import {
  PackageOpen,
  Check,
  Loader2,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  FileText,
  Download,
  XCircle,
  Pencil,
  X,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, doc, updateDoc } from "firebase/firestore";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ── Route with typed search params ──────────────────────────────────────────
export const Route = createFileRoute("/tracking")({
  component: Tracking,
  validateSearch: (search: Record<string, unknown>): { orderId?: string } => ({
    orderId: typeof search.orderId === "string" ? search.orderId : undefined,
  }),
});

function Tracking() {
  const { user } = useLaundry();
  const navigate = useNavigate();
  const { orderId } = Route.useSearch();

  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  // ── Initial fetch + real-time subscriptions ──────────────────────────────
  useEffect(() => {
    if (!user) {
      setLoading(true);
      return;
    }

    const q = query(collection(db, "orders"), where("user_email", "==", user.email));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedOrders = snapshot.docs.map((doc) => {
          const data = doc.data();
          let parsedImages: string[] = [];
          if (data.images) {
            parsedImages = Array.isArray(data.images) ? data.images : [];
          }
          return {
            id: doc.id,
            created_at: data.created_at || data.createdAt || new Date().toISOString(),
            status: normalizeStatus(data.status),
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
            images: parsedImages,
            requires_ironing: !!(data.requires_ironing || data.requiresIroning),
            requires_dry_cleaning: !!(data.requires_dry_cleaning || data.requiresDryCleaning),
            addons: Array.isArray(data.addons) ? data.addons : [],
            deliveryTier: data.deliveryTier || "standard",
            basePrice: data.basePrice !== undefined ? Number(data.basePrice) : undefined,
            invoice: data.invoiceUrl
              ? {
                  id: `inv-${doc.id}`,
                  date: data.created_at || data.createdAt || new Date().toISOString(),
                  name: data.invoiceName || "invoice.pdf",
                  data: data.invoiceUrl,
                }
              : null,
          };
        });

        // Client-side sort desc
        fetchedOrders.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );

        // Filter out placeholders
        const filtered = fetchedOrders.filter(
          (o) => o.delivery_method !== "placeholder" && !o.id.startsWith("placeholder"),
        );

        setOrders(filtered);

        // Determine which order to auto-expand
        if (orderId) {
          const found = filtered.find((o: any) => o.id === orderId);
          setExpandedId(found ? found.id : (filtered[0]?.id ?? null));
        } else {
          setExpandedId((prev) => prev ?? filtered[0]?.id ?? null);
        }

        setLoading(false);
      },
      (err) => {
        console.error("Firestore onSnapshot error:", err);
        setLoading(false);
      },
    );

    const handleStorage = () => {}; // Muted but kept for ref
    window.addEventListener("storage", handleStorage);
    window.addEventListener("laundry-order-updated", handleStorage);

    return () => {
      unsubscribe();
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("laundry-order-updated", handleStorage);
    };
  }, [user, orderId]);

  const HEBREW_MONTHS = [
    "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
    "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
  ];
  const now = new Date();
  const currentMonthVal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const availableMonths = (() => {
    const set = new Set<string>([currentMonthVal]);
    orders.forEach((o) => {
      try {
        const d = new Date(o.created_at);
        if (!isNaN(d.getTime())) {
          set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
        }
      } catch {}
    });
    return Array.from(set)
      .sort((a, b) => (a < b ? 1 : -1))
      .map((v) => {
        const [y, m] = v.split("-");
        const label = v === currentMonthVal
          ? "החודש הנוכחי"
          : `${HEBREW_MONTHS[parseInt(m, 10) - 1]} ${y}`;
        return { value: v, label };
      });
  })();

  const visibleOrders = orders.filter((o) => {
    try {
      const d = new Date(o.created_at);
      if (isNaN(d.getTime())) return false;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return key === selectedMonth;
    } catch { return false; }
  });

  return (
    <AppLayout>
      <AppHeader subtitle="מעקב" />
      <main className="px-5 mt-6 space-y-4 pb-20 text-right dir-rtl" dir="rtl">
        {loading ? (
          <div className="py-20 flex justify-center items-center gap-2">
            <Loader2 className="size-6 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">טוען הזמנות...</span>
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-3xl bg-lavender/40 text-lavender-foreground p-8 text-center border border-lavender-foreground/5 shadow-sm">
            <PackageOpen className="size-12 mx-auto mb-3 opacity-60" strokeWidth={1.5} />
            <p className="font-semibold">אין הזמנות עדיין</p>
            <p className="text-sm opacity-70 mt-1">פתח הזמנה חדשה מהמסך הראשי</p>
            <button
              onClick={() => navigate({ to: "/" })}
              className="mt-5 rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold active:scale-95 transition"
            >
              חזרה לבית
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 bg-card/80 border border-muted-foreground/15 rounded-2xl p-3">
              <label className="text-xs font-black text-foreground">סינון לפי חודש</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="h-9 bg-background border border-muted-foreground/20 rounded-lg px-3 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary text-right"
              >
                {availableMonths.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {visibleOrders.length === 0 ? (
              <div className="rounded-2xl bg-muted/40 p-8 text-center text-sm text-muted-foreground border border-muted-foreground/10">
                אין הזמנות בחודש שנבחר
              </div>
            ) : (
              visibleOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  isExpanded={expandedId === order.id}
                  onToggle={() => setExpandedId(expandedId === order.id ? null : order.id)}
                />
              ))
            )}
          </div>
        )}
      </main>
    </AppLayout>
  );
}

function OrderCard({
  order,
  isExpanded,
  onToggle,
}: {
  order: any;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { resolveAddon, resolveTier } = useLaundryOptions();
  // Delivery-aware steps
  const steps = getOrderSteps(order.delivery_method);
  const currentIdx = steps.findIndex((s) => s.key === order.status);

  const addonsPriceSum = (order.addons || []).reduce(
    (sum: number, key: string) => sum + (resolveAddon(key, order.laundryId)?.price || 0),
    0
  );
  const deliveryTierPrice = order.delivery_method === "home_delivery"
    ? (resolveTier(order.deliveryTier || "standard", order.laundryId)?.price || 0)
    : 0;

  const basePrice = order.basePrice !== undefined 
    ? order.basePrice 
    : (order.amount_due > 0 ? Math.max(0, order.amount_due - addonsPriceSum - deliveryTierPrice) : 0);

  const calculatedTotal = basePrice + addonsPriceSum + deliveryTierPrice;

  // ── Edit state (only active when status === "pending") ────────────────────
  const isLocked = order.status !== "pending";
  const [isEditing, setIsEditing] = useState(false);
  const [editNotes, setEditNotes] = useState("");
  const [editDelivery, setEditDelivery] = useState(order.delivery_method);
  const [editIroning, setEditIroning] = useState<boolean>(order.requires_ironing);
  const [editDryCleaning, setEditDryCleaning] = useState<boolean>(order.requires_dry_cleaning);
  const [isSaving, setIsSaving] = useState(false);

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending":
        return "ממתין";
      case "accepted":
        return "התקבל";
      case "collected":
        return "נאסף";
      case "ready":
        return "מוכן";
      case "delivered":
        return "נמסר";
      case "cancelled":
        return "בוטלה";
      default:
        return "טרם נקבע";
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-purple-50 text-purple-700 border-purple-200/50";
      case "accepted":
        return "bg-blue-50 text-blue-700 border-blue-200/50";
      case "collected":
        return "bg-amber-50 text-amber-700 border-amber-200/50";
      case "ready":
        return "bg-emerald-50 text-emerald-700 border-emerald-200/50";
      case "delivered":
        return "bg-gray-100 text-gray-700 border-gray-200";
      case "cancelled":
        return "bg-gray-200 text-gray-600 border-gray-300";
      default:
        return "bg-slate-50 text-slate-600 border-slate-200";
    }
  };

  const [custNotes, laundryMsg] = (order.notes || "").split(" ||LAUNDRY_MSG|| ");
  const hasNotes = custNotes && custNotes.trim().length > 0;

  let parsedImages: string[] = [];
  if (order.images) {
    try {
      parsedImages = typeof order.images === "string" ? JSON.parse(order.images) : order.images;
    } catch (e) {}
  }
  const hasImages = parsedImages && parsedImages.length > 0;
  const hasLaundryMsg = laundryMsg && laundryMsg.trim().length > 0;

  // ── Save edits to Firestore ──────────────────────────────────────────────
  const handleSaveEdit = async () => {
    if (isLocked) return;
    setIsSaving(true);
    try {
      const [, laundryMsgPart] = (order.notes || "").split(" ||LAUNDRY_MSG|| ");
      const laundryPart = laundryMsgPart ? ` ||LAUNDRY_MSG|| ${laundryMsgPart}` : "";
      await updateDoc(doc(db, "orders", order.id), {
        notes: editNotes.trim() + laundryPart,
        delivery_method: editDelivery,
        deliveryMethod: editDelivery,
        requires_ironing: editIroning,
        requiresIroning: editIroning,
        requires_dry_cleaning: editDryCleaning,
        requiresDryCleaning: editDryCleaning,
      });
      toast.success("פרטי ההזמנה עודכנו בהצלחה!");
      setIsEditing(false);
    } catch (err) {
      toast.error("שגיאה בעדכון ההזמנה");
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  if (isExpanded) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div
          className={`rounded-3xl p-5 relative cursor-pointer ${
            order.status === "cancelled"
              ? "bg-gray-200 text-gray-700 border border-gray-300 opacity-90"
              : order.status === "delivered"
                ? "bg-slate-100 text-slate-700 border border-slate-200"
                : "bg-lime text-lime-foreground shadow-[0_15px_40px_-15px_oklch(0.92_0.18_125/0.6)]"
          }`}
          onClick={onToggle}
        >
          <div className="flex justify-between items-center text-xs opacity-80 mb-3 font-bold border-b border-current/20 pb-2">
            <span className="text-sm">הזמנה #{order.id.split("-")[0]}</span>
            <span>{new Date(order.created_at).toLocaleDateString("he-IL")}</span>
          </div>
          <div className="absolute left-5 top-5 bg-black/10 rounded-full p-1 transition-transform hover:bg-black/20">
            <ChevronUp className="size-5" />
          </div>
          <p className="text-xs font-semibold opacity-70 mt-4">סטטוס נוכחי</p>
          <h2 className="text-xl font-extrabold mt-1">
            {stateLabel[order.status as keyof typeof stateLabel] || getStatusLabel(order.status)}
          </h2>
          {/* Delivery-method-aware progress steps */}
          <ol className="mt-4 space-y-2">
            {steps.map((s, i) => {
              const done = i <= currentIdx;
              return (
                <li key={s.key} className="flex items-center gap-3 text-sm font-semibold">
                  <span
                    className={`size-6 rounded-full grid place-items-center text-[11px] ${
                      done
                        ? order.status === "delivered"
                          ? "bg-slate-700 text-slate-100"
                          : "bg-primary text-primary-foreground"
                        : "bg-background/60 text-muted-foreground"
                    }`}
                  >
                    {done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                  </span>
                  {s.label}
                </li>
              );
            })}
          </ol>
          {/* Delivery-method badge */}
          <div className="mt-3 inline-flex items-center gap-1.5 bg-black/10 rounded-full px-3 py-1 text-[10px] font-bold">
            {order.delivery_method === "self_pickup" ? "🏠 איסוף עצמי" : order.delivery_method === "home_delivery" ? "🚗 משלוח הביתה" : "⏳ טרם נבחר"}
          </div>
        </div>

        {/* ── Lock notice or Edit controls ───────────────────────────── */}
        {order.status !== "cancelled" && (isLocked ? (
          <div className="rounded-2xl bg-muted/60 border border-muted-foreground/15 p-3.5 flex items-center gap-2.5 text-muted-foreground">
            <Lock className="size-4 shrink-0 opacity-60" />
            <div>
              <p className="text-xs font-black text-foreground">ההזמנה נעולה לעריכה</p>
              <p className="text-[10px] mt-0.5 opacity-80">
                לאחר קבלת ההזמנה על ידי המכבסה לא ניתן לבצע שינויים. לסיוע, פנה/י אלינו בצ׳אט.
              </p>
            </div>
          </div>
        ) : isEditing ? (
          /* ── Inline edit form ─────────────────────────────────────── */
          <div
            className="rounded-3xl bg-lavender text-lavender-foreground p-5 space-y-4 shadow-sm border border-lavender-foreground/5 animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-sm text-foreground">✏️ עריכת פרטי הזמנה</h3>
              <button
                onClick={() => setIsEditing(false)}
                className="size-7 rounded-full bg-muted/40 hover:bg-muted flex items-center justify-center transition"
              >
                <X className="size-4 text-muted-foreground" />
              </button>
            </div>
            {/* Notes / address */}
            <div>
              <label className="text-[10px] font-black text-foreground mb-1 block">כתובת / הערות לכביסה</label>
              <textarea
                rows={4}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="כתובת מפורטת, דגשים מיוחדים..."
                className="w-full bg-background border border-muted-foreground/20 rounded-xl px-3 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary resize-none leading-relaxed text-foreground"
              />
            </div>
            {/* Delivery method */}
            <div>
              <label className="text-[10px] font-black text-foreground mb-1 block">שיטת מסירה</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "home_delivery", label: "🚗 משלוח הביתה" },
                  { value: "self_pickup", label: "🏠 איסוף עצמי" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setEditDelivery(opt.value)}
                    className={`py-2.5 rounded-xl text-xs font-bold border transition active:scale-95 ${
                      editDelivery === opt.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-muted-foreground/20 hover:border-primary/40"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Services */}
            <div>
              <label className="text-[10px] font-black text-foreground mb-1.5 block">שירותים נוספים</label>
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setEditIroning((v) => !v)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition active:scale-95 ${
                    editIroning
                      ? "bg-primary/20 text-primary border-primary/30"
                      : "bg-background text-muted-foreground border-muted-foreground/20"
                  }`}
                >
                  🧺 גיהוץ
                </button>
                <button
                  type="button"
                  onClick={() => setEditDryCleaning((v) => !v)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition active:scale-95 ${
                    editDryCleaning
                      ? "bg-primary/20 text-primary border-primary/30"
                      : "bg-background text-muted-foreground border-muted-foreground/20"
                  }`}
                >
                  ✨ ניקוי יבש
                </button>
              </div>
            </div>
            {/* Action buttons */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSaveEdit}
                disabled={isSaving}
                className="flex-1 bg-primary text-primary-foreground rounded-2xl py-3 text-xs font-black active:scale-95 transition disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" strokeWidth={3} />}
                שמור שינויים
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 bg-muted text-muted-foreground rounded-2xl py-3 text-xs font-bold active:scale-95 transition"
              >
                ביטול
              </button>
            </div>
          </div>
        ) : (
          /* ── Edit button for pending orders ─────────────────────── */
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditNotes(custNotes || "");
              setEditDelivery(order.delivery_method);
              setEditIroning(order.requires_ironing);
              setEditDryCleaning(order.requires_dry_cleaning);
              setIsEditing(true);
            }}
            className="w-full flex items-center justify-center gap-1.5 bg-primary/10 text-primary border border-primary/20 rounded-2xl py-3 text-xs font-black hover:bg-primary/20 active:scale-95 transition"
          >
            <Pencil className="size-3.5" />
            עריכת ההזמנה
          </button>
        ))}

        {(hasNotes || hasImages || hasLaundryMsg) && (
          <div className="space-y-4 animate-fade-in">
            {(hasNotes || hasImages) && (
              <div className="rounded-3xl bg-lavender text-lavender-foreground p-5 space-y-4 shadow-sm border border-lavender-foreground/5">
                {hasNotes && (
                  <div>
                    <h3 className="font-extrabold text-xs mb-1 text-foreground">
                      דגשים מיוחדים לכביסה:
                    </h3>
                    <p className="text-xs opacity-90 leading-relaxed text-muted-foreground whitespace-pre-wrap">
                      {custNotes}
                    </p>
                  </div>
                )}
                {hasImages && (
                  <div>
                    <h3 className="font-extrabold text-xs mb-2 text-foreground">תמונות שצורפו:</h3>
                    <div className="flex gap-2 flex-wrap">
                      {parsedImages.map((img, idx) => (
                        <div
                          key={idx}
                          className="relative size-14 rounded-2xl overflow-hidden border-2 border-background shadow-sm hover:scale-105 transition-transform cursor-pointer"
                        >
                          <img
                            src={img}
                            alt="דגש"
                            className="size-full object-cover"
                            onClick={(e) => {
                              e.stopPropagation();
                              toast.info("תמונה מצורפת לכביסה");
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {hasLaundryMsg && (
              <div className="rounded-3xl bg-lime/10 border-2 border-lime/20 text-foreground p-5 space-y-2.5 shadow-md shadow-lime/5 relative overflow-hidden">
                <div className="flex items-center gap-2">
                  <div className="size-8 rounded-full bg-lime/20 grid place-items-center text-lime-foreground">
                    <MessageSquare className="size-4 animate-pulse text-lime-foreground" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-xs text-lime-foreground">
                      עדכון והודעה מהמכבסה:
                    </h3>
                    <span className="text-[9px] font-bold text-muted-foreground">
                      הודעה רשמית מצוות המכבסה
                    </span>
                  </div>
                </div>
                <p className="text-xs font-black text-foreground/90 leading-relaxed bg-white/50 p-3 rounded-2xl border border-lime/5 break-words whitespace-pre-wrap">
                  {laundryMsg}
                </p>
              </div>
            )}

            {order.invoice && (
              <div className="rounded-3xl bg-primary/10 border-2 border-primary/20 text-foreground p-5 space-y-3 shadow-md shadow-primary/5 relative">
                <div className="flex items-center gap-2">
                  <div className="size-8 rounded-full bg-primary/20 grid place-items-center text-primary">
                    <FileText className="size-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-xs text-primary">חשבונית מצורפת:</h3>
                    <span className="text-[9px] font-bold text-muted-foreground">
                      {order.invoice.name}
                    </span>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const link = document.createElement("a");
                    link.href = order.invoice.data;
                    link.download = order.invoice.name || "invoice.pdf";
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  className="w-full bg-primary text-primary-foreground text-xs font-bold py-3 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition"
                >
                  <Download className="size-4" />
                  הורד חשבונית
                </button>
              </div>
            )}
          </div>
        )}

        <div className="rounded-3xl bg-lavender text-lavender-foreground p-5 space-y-3 text-sm border border-lavender-foreground/5 shadow-sm animate-fade-in">
          <div className="border-b border-lavender-foreground/15 pb-2">
            <h4 className="font-extrabold text-xs text-foreground mb-2">שירותים ושדרוגים שנבחרו:</h4>
            <div className="flex gap-1.5 flex-wrap">
              {order.requires_ironing && (
                <span className="bg-primary/10 text-primary border border-primary/20 text-[10px] font-black px-2 py-0.5 rounded-full">גיהוץ 🧺</span>
              )}
              {order.requires_dry_cleaning && (
                <span className="bg-lime/20 text-lime-foreground border border-lime-foreground/20 text-[10px] font-black px-2 py-0.5 rounded-full">ניקוי יבש ✨</span>
              )}
              {(order.addons || []).map((key: string) => {
                const m = resolveAddon(key, order.laundryId);
                if (!m) return null;
                return (
                  <span key={key} className="bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-black px-2 py-0.5 rounded-full">
                    {m.label} (+₪{m.price})
                  </span>
                );
              })}
              {order.delivery_method === "home_delivery" && (() => {
                const tierMeta = resolveTier(order.deliveryTier || "standard", order.laundryId);
                return (
                  <span className="bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-black px-2 py-0.5 rounded-full">
                    {tierMeta?.label} (+₪{tierMeta?.price})
                  </span>
                );
              })()}
              {order.delivery_method === "self_pickup" && (
                <span className="bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-black px-2 py-0.5 rounded-full">
                  🏠 איסוף עצמי (חינם)
                </span>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-extrabold text-xs text-foreground">פירוט סכום הזמנה:</h4>
            <div className="flex justify-between text-xs font-semibold text-muted-foreground">
              <span>סכום בסיס (לפי משקל/פריטים):</span>
              <span>{basePrice > 0 ? `₪${basePrice.toFixed(2)}` : "ממתין לתמחור"}</span>
            </div>
            {addonsPriceSum > 0 && (
              <div className="flex justify-between text-xs font-semibold text-muted-foreground">
                <span>תוספות ושדרוגי פרימיום:</span>
                <span>+₪{addonsPriceSum.toFixed(2)}</span>
              </div>
            )}
            {order.delivery_method === "home_delivery" && deliveryTierPrice > 0 && (
              <div className="flex justify-between text-xs font-semibold text-muted-foreground">
                <span>דמי משלוח ({DELIVERY_TIERS_META[order.deliveryTier || "standard"]?.label}):</span>
                <span>+₪{deliveryTierPrice.toFixed(2)}</span>
              </div>
            )}
            <div className="border-t border-lavender-foreground/15 pt-2 flex justify-between text-sm font-extrabold text-foreground">
              <span>סה״כ לתשלום:</span>
              <span>₪{(order.amount_due || calculatedTotal || 0).toFixed(2)}</span>
            </div>
          </div>

          <div className="border-t border-lavender-foreground/15 pt-2 space-y-1 text-xs">
            <Row
              label="שיטת מסירה"
              value={
                order.delivery_method === "self_pickup"
                  ? "איסוף עצמי"
                  : order.delivery_method === "home_delivery"
                    ? "משלוח הביתה"
                    : "טרם נבחר"
              }
            />
            <Row
              label="סטטוס תשלום"
              value={order.payment_state === "paid" ? "שולם" : "ממתין לתשלום"}
            />
          </div>
        </div>

        {/* Delivery method is now selected during order creation — no post-order picker */}
        {order.delivery_method !== "none" &&
          order.payment_state === "unpaid" &&
          order.status !== "delivered" && order.status !== "cancelled" && (
            <Link
              to="/payments"
              className="block rounded-3xl bg-primary text-primary-foreground p-4 text-center font-bold shadow-md shadow-primary/20 hover:scale-[1.01] active:scale-95 transition"
            >
              המשך לתשלום
            </Link>
          )}

        {order.status === "pending" && <CancelOrderButton orderId={order.id} />}
      </div>
    );
  }

  return (
    <div
      onClick={onToggle}
      className={`backdrop-blur-xl border rounded-2xl p-4 shadow-md space-y-3 cursor-pointer transition active:scale-[0.98] ${
        order.status === "cancelled"
          ? "bg-gray-100/80 border-gray-300 opacity-80 hover:bg-gray-100"
          : "bg-card/80 border-muted-foreground/20 hover:bg-muted/20"
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] text-muted-foreground font-semibold block">מזהה הזמנה:</span>
          <span className="text-xs font-bold text-foreground">#{order.id.split("-")[0]}</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-4 py-1.5 rounded-full text-sm font-black border-2 shadow-sm ${getStatusBadgeClass(order.status)}`}
          >
            {getStatusLabel(order.status)}
          </span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px] bg-muted/40 p-2.5 rounded-xl">
        <div>
          <span className="text-muted-foreground block">שיטת מסירה:</span>
          <span className="font-semibold text-foreground">
            {order.delivery_method === "home_delivery"
              ? "משלוח הביתה"
              : order.delivery_method === "self_pickup"
                ? "איסוף עצמי"
                : "טרם נקבע"}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground block">תאריך הזמנה:</span>
          <span className="font-semibold text-foreground">
            {new Date(order.created_at).toLocaleDateString("he-IL")}
          </span>
        </div>
      </div>

      <div className="flex justify-between items-center pt-1">
        <div>
          <span className="text-[10px] text-muted-foreground block">תשלום:</span>
          <span
            className={`text-[10px] font-bold ${order.payment_state === "paid" ? "text-emerald-600" : "text-amber-600"}`}
          >
            {order.payment_state === "paid" ? "✓ שולם" : "ממתין לתשלום"}
          </span>
        </div>
        <div>
          <span className="text-[10px] text-muted-foreground block text-left">סכום הזמנה:</span>
          <span className="text-sm font-black text-foreground">
            {order.amount_due ? `₪${order.amount_due}` : "₪0.00"}
          </span>
        </div>
      </div>

      {/* Compact pending indicator on collapsed card */}
      {!isLocked && order.status !== "cancelled" && (
        <div className="flex items-center gap-1.5 text-[10px] text-primary font-bold bg-primary/5 rounded-xl px-2.5 py-1.5 border border-primary/10">
          <Pencil className="size-3" />
          <span>ניתן לעריכה — לחץ לפתיחה</span>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="opacity-70">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}

function CancelOrderButton({ orderId }: { orderId: string }) {
  const { cancelOrder } = useLaundry();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-3xl border-2 border-destructive/30 bg-destructive/5 text-destructive p-4 text-center font-bold hover:bg-destructive/10 active:scale-95 transition flex items-center justify-center gap-2"
      >
        <XCircle className="size-5" />
        <span>ביטול הזמנה</span>
      </button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent dir="rtl" className="text-right">
          <AlertDialogHeader>
            <AlertDialogTitle>לבטל את ההזמנה?</AlertDialogTitle>
            <AlertDialogDescription>
              ניתן לבטל רק כאשר הסטטוס הוא 'ממתין'. לאחר ביטול לא ניתן לשחזר את ההזמנה.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>חזור</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async (e) => {
                e.preventDefault();
                setBusy(true);
                const ok = await cancelOrder(orderId);
                setBusy(false);
                if (ok) {
                  toast.success("ההזמנה בוטלה");
                  setOpen(false);
                } else {
                  toast.error("שגיאה בביטול ההזמנה");
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? "מבטל..." : "בטל הזמנה"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
