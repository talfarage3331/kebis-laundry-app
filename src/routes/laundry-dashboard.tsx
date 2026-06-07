import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useLaundry, ORDER_STEPS, stateLabel } from "@/lib/laundry-store";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, doc, updateDoc, getDoc } from "firebase/firestore";
import { 
  ShoppingBasket, Truck, Sparkles, CheckCircle2, AlertCircle, 
  ArrowLeft, LogOut, RefreshCw, MessageSquare, Image as ImageIcon, ChevronDown, Save, Trash2, X, MessageSquareText, ArrowRight
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/laundry-dashboard")({
  component: LaundryDashboard,
});

interface LaundryOrder {
  id: string;
  created_at: string;
  status: "pending" | "picked_up" | "in_progress" | "ready" | "completed";
  delivery_method: string;
  payment_state: string;
  amount_due: number;
  price?: number;
  user_email: string;
  notes?: string;
  deliveryNotes?: string;
  images?: string[];
  requires_ironing?: boolean;
  requires_dry_cleaning?: boolean;
  invoices?: Array<{ id: string; date: string; name: string; data: string }>;
}

function LaundryDashboard() {
  const { user, logout } = useLaundry();
  const navigate = useNavigate();
  
  const [orders, setOrders] = useState<LaundryOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("active");
  const [typedPrices, setTypedPrices] = useState<Record<string, string>>({});
  const [typedMessages, setTypedMessages] = useState<Record<string, string>>({});
  const [typedDeliveryNotes, setTypedDeliveryNotes] = useState<Record<string, string>>({});
  const [pendingStatuses, setPendingStatuses] = useState<Record<string, string>>({});
  const [pendingInvoices, setPendingInvoices] = useState<Record<string, File | null>>({});
  const [savingOrder, setSavingOrder] = useState<Record<string, boolean>>({});
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  // Fetch unread chat messages count for laundry staff in real-time
  useEffect(() => {
    if (!user?.email) return;

    const q = query(collection(db, "chats"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let count = 0;
      snapshot.docs.forEach(doc => {
        const d = doc.data();
        if (d.unreadCount) count += d.unreadCount;
      });
      setUnreadChatCount(count);
    });

    return () => unsubscribe();
  }, [user?.email]);

  // Real-time: listen for ANY changes in orders
  useEffect(() => {
    setIsLoading(true);
    const q = query(collection(db, "orders"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const realOrders = snapshot.docs
        .map((doc) => {
          const o = doc.data();
          let parsedImages = o.images || [];
          if (typeof parsedImages === 'string') {
            try { parsedImages = JSON.parse(parsedImages); } catch(e) {}
          }
          const finalImages = parsedImages || [];
          return {
            id: doc.id,
            created_at: o.created_at || o.createdAt || new Date().toISOString(),
            status: o.status,
            delivery_method: o.delivery_method || o.deliveryMethod || "none",
            payment_state: o.payment_state || o.paymentState || "unpaid",
            amount_due: o.price !== undefined ? o.price : (o.amount_due !== undefined ? o.amount_due : (o.amountDue !== undefined ? o.amountDue : 0)),
            price: o.price !== undefined ? o.price : (o.amount_due !== undefined ? o.amount_due : (o.amountDue !== undefined ? o.amountDue : 0)),
            user_email: o.user_email || o.userEmail || "",
            notes: o.notes || "",
            deliveryNotes: o.deliveryNotes || o.delivery_notes || "",
            images: finalImages,
            requires_ironing: !!(o.requires_ironing || o.requiresIroning),
            requires_dry_cleaning: !!(o.requires_dry_cleaning || o.requiresDryCleaning),
            invoices: o.invoiceUrl ? [{
              id: `inv-${doc.id}`,
              date: o.created_at || o.createdAt || new Date().toISOString(),
              name: o.invoiceName || "invoice.pdf",
              data: o.invoiceUrl
            }] : []
          };
        })
        .filter((o: any) => 
          o.delivery_method !== "placeholder" && 
          !o.id.startsWith("placeholder")
        );

      // Client side sort desc
      realOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setOrders(realOrders as any);
      setIsLoading(false);
    }, (err) => {
      console.error("Firestore orders listen error:", err);
      setIsLoading(false);
    });

    // Mock notification listener kept for visual toast feedback
    const handleStorageChange = () => {
      const notifications = JSON.parse(localStorage.getItem("laundry_notifications") || "[]");
      if (notifications.length > 0) {
        const latest = notifications[0];
        const seenId = sessionStorage.getItem("last_notified_id");
        if (seenId !== latest.id) {
          sessionStorage.setItem("last_notified_id", latest.id);
          toast.info(`🔔 הזמנה חדשה התקבלה מ-${latest.user_email}!`, {
            description: latest.notes,
          });
        }
      }
    };
    window.addEventListener("storage", handleStorageChange);

    return () => {
      unsubscribe();
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, "orders", orderId), { 
        status: newStatus 
      });
      toast.success("סטטוס ההזמנה עודכן בהצלחה!");
    } catch (err: any) {
      toast.error("שגיאה בעדכון הסטטוס: " + err.message);
    }
  };

  const updateOrderPrice = async (orderId: string, newPrice: number) => {
    try {
      await updateDoc(doc(db, "orders", orderId), { 
        price: newPrice,
        amount_due: newPrice,
        amountDue: newPrice,
        total_price: newPrice 
      });
      toast.success("מחיר ההזמנה עודכן בהצלחה!");
    } catch (err: any) {
      toast.error("שגיאה בעדכון המחיר: " + err.message);
    }
  };

  const updateOrderDeliveryNotes = async (orderId: string, notes: string) => {
    try {
      await updateDoc(doc(db, "orders", orderId), { 
        deliveryNotes: notes,
        delivery_notes: notes
      });
    } catch (err: any) {
      toast.error("שגיאה בעדכון הערות משלוח: " + err.message);
    }
  };

  const updateOrderMessage = async (orderId: string, newMessage: string) => {
    try {
      const targetOrder = orders.find(o => o.id === orderId);
      const currentNotes = targetOrder?.notes || "";
      const [custNotes] = currentNotes.split(" ||LAUNDRY_MSG|| ");
      const combined = custNotes.trim() + " ||LAUNDRY_MSG|| " + newMessage.trim();

      await updateDoc(doc(db, "orders", orderId), { 
        notes: combined 
      });
      toast.success("הודעת המכבסה עודכנה בהצלחה!");
    } catch (err: any) {
      toast.error("שגיאה בעדכון ההודעה: " + err.message);
    }
  };

  const uploadInvoice = async (orderId: string, file: File) => {
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("https://tmpfiles.org/api/v1/upload", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Upload server responded with status: ${response.status}`);
      }

      const resJson = await response.json();
      if (resJson.status !== "success" || !resJson.data?.url) {
        throw new Error(resJson.message || "Failed to parse file upload response.");
      }

      const previewUrl = resJson.data.url;
      // Convert standard preview URL to direct download URL
      const directDownloadUrl = previewUrl.replace("https://tmpfiles.org/", "https://tmpfiles.org/dl/");

      await updateDoc(doc(db, "orders", orderId), {
        invoiceUrl: directDownloadUrl,
        invoiceName: file.name
      });
      toast.success("החשבונית הועלתה בהצלחה ונשלחה ללקוח!");
    } catch (err: any) {
      toast.error("שגיאה בהעלאת חשבונית: " + err.message);
      console.error("Invoice upload error:", err);
    }
  };

  // ─── Push Notification Trigger ───────────────────────────────────
  // Calls the server-side /api/push/notify route which reads VAPID
  // secrets from the Cloudflare environment and sends the push.
  const sendPushEvent = async (customerEmail: string, event: string) => {
    try {
      await fetch("/api/push/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userEmail: customerEmail, event }),
      });
    } catch {
      // Never block the UI if push fails
    }
  };

  const saveAllChanges = async (orderId: string) => {
    setSavingOrder(prev => ({ ...prev, [orderId]: true }));
    try {
      // 1. Save price if changed
      const priceVal = typedPrices[orderId];
      if (priceVal !== undefined && priceVal !== "") {
        await updateOrderPrice(orderId, Number(priceVal));
      }

      // 2. Save status if changed
      const newStatus = pendingStatuses[orderId];
      const currentOrder = orders.find(o => o.id === orderId);
      if (newStatus && newStatus !== currentOrder?.status) {
        await updateOrderStatus(orderId, newStatus);
        // Fire the matching push notification to the customer
        const STATUS_PUSH_MAP: Record<string, string> = {
          picked_up: "laundry-picked-up",
          in_progress: "laundry-in-progress",
          ready: "laundry-ready",
          completed: "laundry-delivered",
        };
        if (currentOrder?.user_email && STATUS_PUSH_MAP[newStatus]) {
          await sendPushEvent(currentOrder.user_email, STATUS_PUSH_MAP[newStatus]);
        }
      }

      // 3. Save message if changed
      const newMessage = typedMessages[orderId];
      if (newMessage !== undefined && newMessage.trim() !== "") {
        await updateOrderMessage(orderId, newMessage);
      }

      // 4. Save delivery notes if changed
      const delNotes = typedDeliveryNotes[orderId];
      if (delNotes !== undefined) {
        await updateOrderDeliveryNotes(orderId, delNotes);
      }

      // 5. Upload invoice if selected
      const invoiceFile = pendingInvoices[orderId];
      if (invoiceFile) {
        await uploadInvoice(orderId, invoiceFile);
        setPendingInvoices(prev => { const n = { ...prev }; delete n[orderId]; return n; });
        // Notify customer their invoice is ready
        const invoiceOrder = orders.find(o => o.id === orderId);
        if (invoiceOrder?.user_email) {
          await sendPushEvent(invoiceOrder.user_email, "invoice-ready");
        }
      }

      // Notify customer of price update (fired after price & invoice are saved)
      const priceChanged = priceVal !== undefined && priceVal !== "";
      if (priceChanged) {
        const priceOrder = orders.find(o => o.id === orderId);
        if (priceOrder?.user_email) {
          await sendPushEvent(priceOrder.user_email, "price-updated");
        }
      }

      toast.success("✅ כל השינויים נשמרו ועודכנו אצל הלקוח!");
    } catch (err: any) {
      toast.error("שגיאה בשמירת השינויים: " + err.message);
    } finally {
      setSavingOrder(prev => ({ ...prev, [orderId]: false }));
    }
  };

  const deleteUploadedInvoice = async (orderId: string, _userEmail: string, _invoiceDate: string, _invoiceName: string) => {
    if (!confirm("האם אתה בטוח שברצונך למחוק חשבונית זו?")) {
      return;
    }
    try {
      await updateDoc(doc(db, "orders", orderId), {
        invoiceUrl: "",
        invoiceName: ""
      });
      toast.success("החשבונית נמחקה בהצלחה!");
    } catch (err: any) {
      toast.error("שגיאה במחיקת החשבונית: " + err.message);
    }
  };

  const deleteOrderImage = async (orderId: string, imageUrl: string) => {
    if (!confirm("האם אתה בטוח שברצונך למחוק תמונה זו מההזמנה?")) {
      return;
    }
    try {
      const targetOrder = orders.find(o => o.id === orderId);
      if (!targetOrder) {
        toast.error("ההזמנה לא נמצאה");
        return;
      }
      const currentImages = targetOrder.images || [];
      const updatedImages = currentImages.filter(img => img !== imageUrl);

      await updateDoc(doc(db, "orders", orderId), { 
        images: updatedImages 
      });
      toast.success("התמונה נמחקה בהצלחה מההזמנה!");
    } catch (err: any) {
      toast.error("שגיאה במחיקת התמונה: " + err.message);
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending": return "התקבלה במכבסה";
      case "picked_up": return "התקבלה במכבסה";
      case "in_progress": return "בתהליך כביסה";
      case "ready": return "מוכן למשלוח";
      case "completed": return "נמסר";
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-purple-100 text-purple-800 border-purple-200";
      case "picked_up": return "bg-amber-100 text-amber-800 border-amber-200";
      case "in_progress": return "bg-blue-100 text-blue-800 border-blue-200";
      case "ready": return "bg-lime text-lime-foreground border-lime/20";
      case "completed": return "bg-slate-100 text-slate-600 border-slate-200";
      default: return "bg-muted text-muted-foreground border-muted-foreground/10";
    }
  };

  // Filter orders
  const filteredOrders = orders.filter((o) => {
    if (activeTab === "active") {
      return o.status !== "completed";
    } else {
      return o.status === "completed";
    }
  });

  return (
    <AppLayout>
      <div className="min-h-screen bg-background pb-12 dir-rtl text-right overflow-x-hidden" dir="rtl">
        {/* Top Header */}
        <header className="bg-lavender px-4 pb-4 sm:px-6 sm:pb-6 pt-safe-lavender rounded-b-[2rem] shadow-sm flex items-center justify-between gap-3">
          <div>
            <span className="text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-full">מכונת כביסה וטיפול</span>
            <h1 className="text-xl sm:text-2xl font-black mt-2 text-lavender-foreground">לוח עבודה צוות מכבסה</h1>
          </div>
          <button
            onClick={() => {
              logout();
              navigate({ to: "/login" });
            }}
            className="size-11 rounded-2xl bg-background/50 hover:bg-background/80 flex items-center justify-center text-destructive transition-colors active:scale-95 shadow-sm"
            title="התנתק"
          >
            <LogOut className="size-5" />
          </button>
        </header>

        <main className="px-3 sm:px-5 mt-4 sm:mt-6 space-y-4 sm:space-y-5 max-w-full">
          {/* Quick Stats Banner */}
          <section className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {[
              { label: "ממתינים", count: orders.filter(o => o.status === "pending").length, color: "text-purple-600 bg-purple-50 border-purple-100" },
              { label: "נאספו", count: orders.filter(o => o.status === "picked_up").length, color: "text-amber-600 bg-amber-50 border-amber-100" },
              { label: "בטיפול", count: orders.filter(o => o.status === "in_progress").length, color: "text-blue-600 bg-blue-50 border-blue-100" },
              { label: "מוכנים", count: orders.filter(o => o.status === "ready").length, color: "text-lime-foreground bg-lime/10 border-lime/20" },
              { label: "הושלמו", count: orders.filter(o => o.status === "completed").length, color: "text-slate-600 bg-slate-50 border-slate-100" }
            ].map((stat, idx) => (
              <div key={idx} className={`border rounded-2xl p-2 sm:p-2.5 flex flex-col items-center justify-center text-center ${stat.color}`}>
                <span className="text-base sm:text-lg font-black">{stat.count}</span>
                <span className="text-[9px] sm:text-[10px] font-bold opacity-80">{stat.label}</span>
              </div>
            ))}
          </section>

          {/* Chat Dashboard Link */}
          <button
            onClick={() => navigate({ to: "/admin-chat" })}
            className="relative w-full bg-primary/10 border-2 border-primary/20 text-primary hover:bg-primary hover:text-primary-foreground hover:border-primary rounded-2xl p-3 sm:p-4 flex items-center justify-between font-extrabold transition-all group active:scale-95 no-underline cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="relative size-10 rounded-full bg-background/50 grid place-items-center group-hover:bg-primary-foreground/20">
                <MessageSquareText className="size-5" />
                {unreadChatCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-md">
                    {unreadChatCount > 99 ? "99+" : unreadChatCount}
                  </span>
                )}
              </div>
              <div className="text-right">
                <span className="block text-sm sm:text-base">לוח הודעות ללקוחות (צ'אט)</span>
                <span className="text-xs opacity-80 font-semibold block mt-0.5">מענה מיידי ללקוחות בזמן אמת</span>
              </div>
            </div>
            <ArrowRight className="size-5 rotate-180 opacity-50 group-hover:opacity-100 group-hover:-translate-x-1 transition-all" />
          </button>

          {/* Active Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab("active")}
              className={`flex-1 py-2.5 sm:py-3 rounded-2xl text-[11px] sm:text-xs font-black transition border active:scale-95 min-h-[44px] ${
                activeTab === "active"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground border-muted-foreground/10"
              }`}
            >
              הזמנות פעילות ({orders.filter(o => o.status !== "completed").length})
            </button>
            <button
              onClick={() => setActiveTab("completed")}
              className={`flex-1 py-2.5 sm:py-3 rounded-2xl text-[11px] sm:text-xs font-black transition border active:scale-95 min-h-[44px] ${
                activeTab === "completed"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground border-muted-foreground/10"
              }`}
            >
              היסטוריית הזמנות ({orders.filter(o => o.status === "completed").length})
            </button>
          </div>

          {/* Order Cards List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-base font-extrabold text-foreground">
                {activeTab === "active" ? "הזמנות לטיפול" : "הזמנות שהושלמו"}
              </h2>
              <button 
                onClick={() => toast.success("הנתונים מסונכרנים בזמן אמת! ✨")}
                className="size-8 rounded-full hover:bg-muted flex items-center justify-center text-primary transition active:rotate-180 duration-500"
                title="רענן"
              >
                <RefreshCw className="size-4" />
              </button>
            </div>

            {isLoading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-2">
                <div className="animate-spin rounded-full size-8 border-4 border-primary border-t-transparent" />
                <span className="text-sm text-muted-foreground">טוען הזמנות כביסה...</span>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="bg-muted/30 border border-muted/50 rounded-3xl p-12 text-center text-muted-foreground">
                לא נמצאו הזמנות בקטגוריה זו.
              </div>
            ) : (
              <div className="space-y-4">
                {filteredOrders.map((order) => (
                  <div 
                    key={order.id}
                    className="bg-card border border-muted-foreground/10 rounded-2xl sm:rounded-3xl p-3 sm:p-5 shadow-sm space-y-3 sm:space-y-4 max-w-full overflow-hidden"
                  >
                    {/* Card Top */}
                    <div className="flex items-start sm:items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] sm:text-xs font-bold text-muted-foreground">מזהה הזמנה:</span>
                        <h3 className="text-xs sm:text-sm font-extrabold text-foreground truncate max-w-full" title={order.id}>{order.id}</h3>
                      </div>
                      <span className={`px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-bold border whitespace-nowrap shrink-0 ${getStatusColor(order.status)}`}>
                        {getStatusLabel(order.status)}
                      </span>
                    </div>

                    {/* Customer Info */}
                    <div className="bg-muted/40 rounded-2xl p-2.5 sm:p-3 text-[11px] sm:text-xs space-y-1 break-words overflow-hidden">
                      <p className="font-bold text-foreground break-all">לקוח: <span className="font-semibold text-muted-foreground">{order.user_email}</span></p>
                      <p className="font-bold text-foreground">
                        שיטת מסירה: <span className="font-semibold text-muted-foreground">
                          {order.delivery_method === "home_delivery" ? "משלוח עד הבית" : order.delivery_method === "self_pickup" ? "איסוף עצמי" : "טרם נקבע"}
                        </span>
                      </p>
                      <p className="font-bold text-foreground">תאריך הזמנה: <span className="font-semibold text-muted-foreground">{new Date(order.created_at).toLocaleDateString("he-IL")}</span></p>
                    </div>

                    {/* Notes & Comments */}
                    {order.notes && (() => {
                      const [custNotes, laundryMsg] = order.notes.split(" ||LAUNDRY_MSG|| ");
                      return (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                              <MessageSquare className="size-4 text-primary" />
                              <span>הנחיות כביסה ודגשים:</span>
                            </h4>
                            {/* Services badges inside header */}
                            <div className="flex gap-1.5">
                              {order.requires_ironing && (
                                <span className="bg-primary/10 text-primary border border-primary/20 text-[10px] font-black px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm">
                                  גיהוץ 🧺
                                </span>
                              )}
                              {order.requires_dry_cleaning && (
                                <span className="bg-lime/20 text-lime-foreground border border-lime-foreground/20 text-[10px] font-black px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm">
                                  ניקוי יבש ✨
                                </span>
                              )}
                            </div>
                          </div>
                          {custNotes && (
                            <p className="text-xs bg-lavender/20 text-muted-foreground p-3 rounded-2xl leading-relaxed border border-lavender-foreground/5 font-semibold whitespace-pre-wrap">
                              {custNotes}
                            </p>
                          )}
                          {laundryMsg && (
                            <div className="bg-lime/10 border border-lime/20 rounded-2xl p-3 text-xs space-y-1">
                              <p className="font-extrabold text-lime-foreground flex items-center gap-1">
                                <MessageSquare className="size-3.5" />
                                <span>הודעה שנשלחה ללקוח:</span>
                              </p>
                              <p className="text-foreground leading-relaxed font-bold">{laundryMsg}</p>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Requested Services Badges row if no notes */}
                    {!(order.notes) && (order.requires_ironing || order.requires_dry_cleaning) && (
                      <div className="flex gap-2 flex-wrap pt-1">
                        {order.requires_ironing && (
                          <span className="bg-primary/10 text-primary border border-primary/20 text-[10px] font-black px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm">
                            גיהוץ 🧺
                          </span>
                        )}
                        {order.requires_dry_cleaning && (
                          <span className="bg-lime/20 text-lime-foreground border border-lime-foreground/20 text-[10px] font-black px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm">
                            ניקוי יבש ✨
                          </span>
                        )}
                      </div>
                    )}

                    {/* Image Attachments */}
                    {order.images && order.images.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <ImageIcon className="size-4 text-primary" />
                          <span>צילומים מצורפים:</span>
                        </h4>
                        <div className="flex gap-2 flex-wrap">
                          {order.images.map((img, idx) => (
                            <div key={idx} className="relative size-16 rounded-2xl overflow-hidden border border-muted-foreground/10 hover:scale-105 transition-all shadow-sm cursor-pointer group">
                              <img 
                                src={img} 
                                alt="תצוגת דגש" 
                                className="size-full object-cover" 
                                onClick={() => {
                                  const win = window.open();
                                  if (win) {
                                    win.document.write(`<img src="${img}" style="max-width:100%; max-height:100vh; display:block; margin:auto;" />`);
                                  }
                                }} 
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteOrderImage(order.id, img);
                                }}
                                className="absolute top-1 left-1 bg-destructive/95 hover:bg-destructive text-destructive-foreground rounded-full p-1 shadow-md transition-all scale-90 hover:scale-100 active:scale-90 flex items-center justify-center"
                                title="מחק תמונה"
                              >
                                <Trash2 className="size-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Dynamic Pricing Input Area */}
                    <div className="space-y-2 pt-2 border-t border-muted-foreground/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
                      <div className="flex-1">
                        <label className="text-[11px] font-extrabold text-muted-foreground block mb-1">מחיר סופי להזמנה (₪):</label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={typedPrices[order.id] !== undefined ? typedPrices[order.id] : String(order.price !== undefined ? order.price : (order.amount_due || ""))}
                            onChange={(e) => setTypedPrices(prev => ({ ...prev, [order.id]: e.target.value }))}
                            placeholder="הזן סכום לתשלום"
                            className="bg-background border border-muted-foreground/20 rounded-xl px-3 py-2.5 sm:py-2 text-xs font-bold w-full focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                          />
                        </div>
                      </div>
                      <div className="text-left sm:min-w-[70px] flex sm:block items-center gap-2">
                        <span className="text-[10px] font-bold text-muted-foreground block">מחיר נוכחי</span>
                        <span className="text-sm font-black text-foreground">
                          {order.price !== undefined ? `₪${order.price}` : (order.amount_due ? `₪${order.amount_due}` : "טרם נקבע")}
                        </span>
                      </div>
                    </div>

                    {/* Delivery Notes (הערות משלוח) */}
                    <div className="space-y-2 pt-2 border-t border-muted-foreground/5">
                      <label className="text-[11px] font-extrabold text-muted-foreground block mb-1">הערות משלוח (טקסט חופשי):</label>
                      <textarea
                        rows={2}
                        value={typedDeliveryNotes[order.id] !== undefined ? typedDeliveryNotes[order.id] : (order.deliveryNotes || "")}
                        onChange={(e) => setTypedDeliveryNotes(prev => ({ ...prev, [order.id]: e.target.value }))}
                        placeholder="הקלד הערות משלוח, כתובת מפורטת, קוד כניסה או הנחיות מיוחדות לשליח..."
                        className="bg-background border border-muted-foreground/20 rounded-xl px-3 py-2.5 sm:py-2 text-[11px] font-semibold w-full focus:outline-none focus:ring-2 focus:ring-primary leading-normal resize-none min-h-[44px]"
                      />
                    </div>

                    {/* Write Message to Customer Area */}
                    <div className="space-y-2 pt-2 border-t border-muted-foreground/5">
                      <label className="text-[11px] font-extrabold text-muted-foreground block mb-1">כתוב הודעה / עדכון ללקוח:</label>
                      <div className="flex gap-2">
                        <textarea
                          rows={2}
                          value={typedMessages[order.id] !== undefined ? typedMessages[order.id] : (() => {
                            const [, laundryMsg] = (order.notes || "").split(" ||LAUNDRY_MSG|| ");
                            return laundryMsg || "";
                          })()}
                          onChange={(e) => setTypedMessages(prev => ({ ...prev, [order.id]: e.target.value }))}
                          placeholder="הקלד הודעה ללקוח (למשל: הכביסה נשקלה, המחיר עודכן והיא בטיפול)..."
                          className="bg-background border border-muted-foreground/20 rounded-xl px-3 py-2.5 sm:py-2 text-[11px] font-semibold w-full focus:outline-none focus:ring-2 focus:ring-primary leading-normal resize-none min-h-[44px]"
                        />
                      </div>
                    </div>

                    {/* Action Select Box to transition state */}
                    <div className="space-y-2 pt-2 border-t border-muted-foreground/5">
                      <label className="text-[11px] font-extrabold text-muted-foreground block mb-1">עדכן סטטוס טיפול בכביסה (Dropdown):</label>
                      <select
                        value={pendingStatuses[order.id] || order.status}
                        onChange={(e) => setPendingStatuses(prev => ({ ...prev, [order.id]: e.target.value }))}
                        className="bg-background border border-muted-foreground/20 rounded-xl px-3 py-2.5 sm:py-2 text-xs font-bold w-full focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px] text-right"
                      >
                        <option value="pending">התקבלה במכבסה (ממתין)</option>
                        <option value="picked_up">התקבלה במכבסה (נאסף)</option>
                        <option value="in_progress">בתהליך כביסה</option>
                        <option value="ready">מוכן למשלוח</option>
                        <option value="completed">נמסר (הושלם)</option>
                      </select>
                    </div>

                    {/* Already Uploaded Invoices */}
                    {order.invoices && order.invoices.length > 0 && (
                      <div className="space-y-1.5 pt-2 border-t border-muted-foreground/5">
                        <label className="text-[11px] font-extrabold text-muted-foreground block">חשבוניות שנשלחו ללקוח:</label>
                        <div className="space-y-1">
                          {order.invoices.map((inv, idx) => (
                            <div key={idx} className="flex flex-wrap sm:flex-nowrap items-center justify-between bg-muted/30 hover:bg-muted/50 rounded-xl p-2 sm:p-2.5 border border-muted-foreground/10 transition-colors gap-1.5">
                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                <span className="text-[11px] font-bold text-foreground truncate max-w-[120px] sm:max-w-[200px]" title={inv.name}>📄 {inv.name}</span>
                                <span className="text-[9px] text-muted-foreground font-semibold">({new Date(inv.date).toLocaleDateString("he-IL")})</span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0 mr-auto sm:mr-0">
                                <a 
                                  href={inv.data} 
                                  download={inv.name}
                                  className="text-[10px] font-black text-primary hover:text-primary/80 bg-primary/10 px-2 py-1.5 sm:py-1 rounded-lg transition active:scale-95 min-h-[36px] sm:min-h-0 flex items-center"
                                >
                                  הורדה
                                </a>
                                <button
                                  type="button"
                                  onClick={() => deleteUploadedInvoice(order.id, order.user_email, inv.date, inv.name)}
                                  className="text-[10px] font-black text-destructive hover:text-destructive/80 bg-destructive/10 px-2 py-1.5 sm:py-1 rounded-lg transition active:scale-95 flex items-center gap-0.5 min-h-[36px] sm:min-h-0"
                                >
                                  <Trash2 className="size-3" />
                                  <span>מחק</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Upload Invoice */}
                    <div className="space-y-2 pt-2 border-t border-muted-foreground/5">
                      <label className="text-[11px] font-extrabold text-muted-foreground block">צירוף ושליחת חשבונית:</label>
                      <input 
                        type="file" 
                        accept="application/pdf,image/*"
                        className="text-[11px] block w-full text-muted-foreground file:mr-0 file:ml-4 file:py-2.5 sm:file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-[10px] file:font-extrabold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 file:cursor-pointer cursor-pointer transition file:min-h-[44px] sm:file:min-h-0"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setPendingInvoices(prev => ({ ...prev, [order.id]: e.target.files![0] }));
                            toast.info(`קובץ "${e.target.files[0].name}" נבחר — לחץ 'שמור את כל השינויים' לשליחה`);
                          }
                        }}
                      />
                      {pendingInvoices[order.id] && (
                        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between bg-primary/5 rounded-xl p-2 mt-1 border border-primary/10 gap-1.5">
                          <p className="text-[10px] text-primary font-bold truncate min-w-0 flex-1">📎 {pendingInvoices[order.id]!.name} — ממתין לשמירה</p>
                          <button
                            type="button"
                            onClick={() => {
                              setPendingInvoices(prev => {
                                const n = { ...prev };
                                delete n[order.id];
                                return n;
                              });
                            }}
                            className="text-[10px] text-destructive hover:text-destructive/80 font-black flex items-center gap-0.5 bg-destructive/10 px-2 py-1.5 sm:py-1 rounded-lg transition active:scale-95 min-h-[36px] sm:min-h-0 shrink-0"
                          >
                            <X className="size-3" />
                            <span>בטל</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Save All Changes Button */}
                    <div className="pt-4 border-t-2 border-primary/10">
                      <button
                        onClick={() => saveAllChanges(order.id)}
                        disabled={savingOrder[order.id]}
                        className="w-full bg-gradient-to-l from-primary to-primary/80 text-primary-foreground font-black text-xs sm:text-sm py-3.5 sm:py-4 rounded-2xl transition active:scale-[0.98] hover:shadow-lg hover:shadow-primary/20 flex items-center justify-center gap-2 sm:gap-2.5 disabled:opacity-60 disabled:cursor-not-allowed min-h-[48px]"
                      >
                        {savingOrder[order.id] ? (
                          <>
                            <div className="animate-spin rounded-full size-5 border-2 border-primary-foreground border-t-transparent" />
                            <span>שומר שינויים...</span>
                          </>
                        ) : (
                          <>
                            <Save className="size-5" />
                            <span>💾 שמור את כל השינויים</span>
                          </>
                        )}
                      </button>
                    </div>

                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </AppLayout>
  );
}
