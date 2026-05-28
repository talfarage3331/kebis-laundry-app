import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useLaundry, ORDER_STEPS, stateLabel } from "@/lib/laundry-store";
import { supabase } from "@/lib/supabase";
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
  user_email: string;
  notes?: string;
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
  const [pendingStatuses, setPendingStatuses] = useState<Record<string, string>>({});
  const [pendingInvoices, setPendingInvoices] = useState<Record<string, File | null>>({});
  const [savingOrder, setSavingOrder] = useState<Record<string, boolean>>({});

  const fetchOrders = async (showLoader = true) => {
    if (showLoader) setIsLoading(true);
    try {
      // 1. Fetch all orders from Supabase (including completed)
      const { data: dbOrders, error: ordersError } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (ordersError) throw ordersError;

      // 2. Fetch all invoices from the SQL table
      const { data: dbInvoices, error: invoicesError } = await supabase
        .from("invoices")
        .select("*")
        .order("created_at", { ascending: false });

      if (invoicesError) throw invoicesError;

      // Build a map of orderId -> array of invoices
      const orderInvoicesMap: Record<string, any[]> = {};
      (dbInvoices || []).forEach(inv => {
        if (inv.order_id) {
          if (!orderInvoicesMap[inv.order_id]) {
            orderInvoicesMap[inv.order_id] = [];
          }
          orderInvoicesMap[inv.order_id].push({
            id: inv.id,
            order_id: inv.order_id,
            date: inv.created_at,
            name: inv.name,
            data: inv.data
          });
        }
      });

      const realOrders = (dbOrders || [])
        .filter((o: any) => 
          o.delivery_method !== "placeholder" && 
          !(o.delivery_method || "").startsWith("PROFILE_SYNC:")
        ).map((o: any) => {
          let parsedImages = o.images;
          if (typeof parsedImages === 'string') {
            try { parsedImages = JSON.parse(parsedImages); } catch(e) {}
          }
          const finalImages = parsedImages || [];
          return {
            id: o.id,
            created_at: o.created_at || new Date().toISOString(),
            status: o.status,
            delivery_method: o.delivery_method,
            payment_state: o.payment_state,
            amount_due: o.amount_due,
            user_email: o.user_email,
            notes: o.notes || "",
            images: finalImages,
            requires_ironing: !!o.requires_ironing,
            requires_dry_cleaning: !!o.requires_dry_cleaning,
            invoices: orderInvoicesMap[o.id] || []
          };
        });

      setOrders(realOrders);
    } catch (err: any) {
      toast.error("שגיאה בטעינת הזמנות: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();

    const handleStorageChange = () => {
      const notifications = JSON.parse(localStorage.getItem("laundry_notifications") || "[]");
      if (notifications.length > 0) {
        const latest = notifications[0];
        
        // Prevent duplicate toast sounds for the same notification ID
        const seenId = sessionStorage.getItem("last_notified_id");
        if (seenId !== latest.id) {
          sessionStorage.setItem("last_notified_id", latest.id);
          
          toast.info(`🔔 הזמנה חדשה התקבלה מ-${latest.user_email}!`, {
            description: latest.notes,
            action: {
              label: "הצג הזמנה",
              onClick: () => fetchOrders()
            }
          });

          // Play soft synthesized dual-tone notification chime (D5 -> A5 chord)
          try {
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc1 = audioCtx.createOscillator();
            const gain1 = audioCtx.createGain();
            osc1.connect(gain1);
            gain1.connect(audioCtx.destination);
            osc1.type = "sine";
            osc1.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
            gain1.gain.setValueAtTime(0.08, audioCtx.currentTime);
            gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
            osc1.start();
            osc1.stop(audioCtx.currentTime + 0.35);

            setTimeout(() => {
              const osc2 = audioCtx.createOscillator();
              const gain2 = audioCtx.createGain();
              osc2.connect(gain2);
              gain2.connect(audioCtx.destination);
              osc2.type = "sine";
              osc2.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
              gain2.gain.setValueAtTime(0.08, audioCtx.currentTime);
              gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.45);
              osc2.start();
              osc2.stop(audioCtx.currentTime + 0.45);
            }, 120);
          } catch (e) {
            console.log("Audio auto-play blocked by browser sandbox");
          }

          fetchOrders(false);
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // Real-time: listen for ANY changes in orders and invoices table directly
  useEffect(() => {
    const sub = supabase
      .channel('laundry-db-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          fetchOrders(false);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'invoices' },
        () => {
          fetchOrders(false);
        }
      )
      .subscribe();

    return () => { sub.unsubscribe(); };
  }, []);

  const updateOrderStatus = async (orderId: string, newStatus: "pending" | "picked_up" | "in_progress" | "ready" | "completed") => {
    try {
      const { error } = await supabase.from("orders").update({ status: newStatus }).eq("id", orderId);
      if (error) throw error;

      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
      toast.success("סטטוס ההזמנה עודכן בהצלחה!");
      localStorage.setItem("laundry_sync_trigger", Date.now().toString());
      window.dispatchEvent(new Event("storage"));
    } catch (err: any) {
      toast.error("שגיאה בעדכון הסטטוס: " + err.message);
    }
  };

  const updateOrderPrice = async (orderId: string, newPrice: number) => {
    try {
      const { error } = await supabase.from("orders").update({ amount_due: newPrice, total_price: newPrice }).eq("id", orderId);
      if (error) throw error;

      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, amount_due: newPrice } : o));
      toast.success("מחיר ההזמנה עודכן בהצלחה!");
      
      const newNotification = {
        id: "price-update-" + orderId + "-" + Date.now(),
        user_email: "system-update",
        notes: `מחיר עודכן ל-₪${newPrice}`,
        timestamp: new Date().toLocaleTimeString("he-IL")
      };
      const existing = JSON.parse(localStorage.getItem("laundry_notifications") || "[]");
      localStorage.setItem("laundry_notifications", JSON.stringify([newNotification, ...existing]));
      window.dispatchEvent(new Event("storage"));
    } catch (err: any) {
      toast.error("שגיאה בעדכון המחיר: " + err.message);
    }
  };

  const updateOrderMessage = async (orderId: string, newMessage: string) => {
    try {
      const targetOrder = orders.find(o => o.id === orderId);
      const currentNotes = targetOrder?.notes || "";
      const [custNotes] = currentNotes.split(" ||LAUNDRY_MSG|| ");
      const combined = custNotes.trim() + " ||LAUNDRY_MSG|| " + newMessage.trim();

      const { error } = await supabase.from("orders").update({ notes: combined }).eq("id", orderId);
      if (error) throw error;

      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, notes: combined } : o));
      toast.success("הודעת המכבסה עודכנה בהצלחה!");
      localStorage.setItem("laundry_sync_trigger", Date.now().toString());
      window.dispatchEvent(new Event("storage"));
    } catch (err: any) {
      toast.error("שגיאה בעדכון ההודעה: " + err.message);
    }
  };

  const uploadInvoice = async (orderId: string, file: File) => {
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64data = reader.result;
        const targetOrder = orders.find(o => o.id === orderId);
        
        if (targetOrder) {
          const { error } = await supabase
            .from("invoices")
            .insert([{
              order_id: orderId,
              user_email: targetOrder.user_email,
              name: file.name,
              data: base64data
            }]);

          if (error) throw error;

          toast.success("החשבונית צורפה ונשלחה ללקוח!");
          fetchOrders(false);
          localStorage.setItem("laundry_sync_trigger", Date.now().toString());
          window.dispatchEvent(new Event("storage"));
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      toast.error("שגיאה בהעלאת חשבונית: " + err.message);
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
        await updateOrderStatus(orderId, newStatus as any);
      }

      // 3. Save message if changed
      const newMessage = typedMessages[orderId];
      if (newMessage !== undefined && newMessage.trim() !== "") {
        await updateOrderMessage(orderId, newMessage);
      }

      // 4. Upload invoice if selected
      const invoiceFile = pendingInvoices[orderId];
      if (invoiceFile) {
        await uploadInvoice(orderId, invoiceFile);
        setPendingInvoices(prev => { const n = { ...prev }; delete n[orderId]; return n; });
      }

      toast.success("✅ כל השינויים נשמרו ועודכנו אצל הלקוח!");
    } catch (err: any) {
      toast.error("שגיאה בשמירת השינויים: " + err.message);
    } finally {
      setSavingOrder(prev => ({ ...prev, [orderId]: false }));
    }
  };

  const deleteUploadedInvoice = async (orderId: string, userEmail: string, invoiceDate: string, invoiceName: string) => {
    if (!confirm("האם אתה בטוח שברצונך למחוק חשבונית זו?")) {
      return;
    }
    
    try {
      const { error } = await supabase
        .from("invoices")
        .delete()
        .eq("order_id", orderId)
        .eq("name", invoiceName);

      if (error) throw error;

      toast.success("החשבונית נמחקה בהצלחה!");
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, invoices: (o.invoices || []).filter(i => i.name !== invoiceName) } : o));
      fetchOrders(false);
      localStorage.setItem("laundry_sync_trigger", Date.now().toString());
      window.dispatchEvent(new Event("storage"));
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

      // Update in the DB (Supabase orders table)
      const { error } = await supabase
        .from("orders")
        .update({ images: updatedImages })
        .eq("id", orderId);

      if (error) throw error;

      // Sync to local storage
      localStorage.setItem(`laundry_images_${targetOrder.user_email}`, JSON.stringify(updatedImages));

      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, images: updatedImages } : o));
      toast.success("התמונה נמחקה בהצלחה מההזמנה!");
      
      localStorage.setItem("laundry_sync_trigger", Date.now().toString());
      window.dispatchEvent(new Event("storage"));
    } catch (err: any) {
      toast.error("שגיאה במחיקת התמונה: " + err.message);
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending": return "ממתין לאיסוף";
      case "picked_up": return "נאסף";
      case "in_progress": return "בטיפול";
      case "ready": return "מוכן";
      case "completed": return "הושלם";
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
      <div className="min-h-screen bg-background pb-12 dir-rtl text-right" dir="rtl">
        {/* Top Header */}
        <header className="bg-lavender p-6 rounded-b-[2rem] shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-full">מכונת כביסה וטיפול</span>
            <h1 className="text-2xl font-black mt-2 text-lavender-foreground">לוח עבודה צוות מכבסה</h1>
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

        <main className="px-5 mt-6 space-y-5">
          {/* Quick Stats Banner */}
          <section className="grid grid-cols-5 gap-2">
            {[
              { label: "ממתינים", count: orders.filter(o => o.status === "pending").length, color: "text-purple-600 bg-purple-50 border-purple-100" },
              { label: "נאספו", count: orders.filter(o => o.status === "picked_up").length, color: "text-amber-600 bg-amber-50 border-amber-100" },
              { label: "בטיפול", count: orders.filter(o => o.status === "in_progress").length, color: "text-blue-600 bg-blue-50 border-blue-100" },
              { label: "מוכנים", count: orders.filter(o => o.status === "ready").length, color: "text-lime-foreground bg-lime/10 border-lime/20" },
              { label: "הושלמו", count: orders.filter(o => o.status === "completed").length, color: "text-slate-600 bg-slate-50 border-slate-100" }
            ].map((stat, idx) => (
              <div key={idx} className={`border rounded-2xl p-2.5 flex flex-col items-center justify-center text-center ${stat.color}`}>
                <span className="text-lg font-black">{stat.count}</span>
                <span className="text-[9px] font-bold opacity-80">{stat.label}</span>
              </div>
            ))}
          </section>

          {/* Chat Dashboard Link */}
          <button
            onClick={() => navigate({ to: "/admin-chat" })}
            className="w-full bg-primary/10 border-2 border-primary/20 text-primary hover:bg-primary hover:text-primary-foreground hover:border-primary rounded-2xl p-4 flex items-center justify-between font-extrabold transition-all group active:scale-95 no-underline cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-background/50 grid place-items-center group-hover:bg-primary-foreground/20">
                <MessageSquareText className="size-5" />
              </div>
              <div className="text-right">
                <span className="block text-base">לוח הודעות ללקוחות (צ'אט)</span>
                <span className="text-xs opacity-80 font-semibold block mt-0.5">מענה מיידי ללקוחות בזמן אמת</span>
              </div>
            </div>
            <ArrowRight className="size-5 rotate-180 opacity-50 group-hover:opacity-100 group-hover:-translate-x-1 transition-all" />
          </button>

          {/* Active Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab("active")}
              className={`flex-1 py-3 rounded-2xl text-xs font-black transition border active:scale-95 ${
                activeTab === "active"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground border-muted-foreground/10"
              }`}
            >
              הזמנות פעילות ({orders.filter(o => o.status !== "completed").length})
            </button>
            <button
              onClick={() => setActiveTab("completed")}
              className={`flex-1 py-3 rounded-2xl text-xs font-black transition border active:scale-95 ${
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
                onClick={() => fetchOrders(true)}
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
                    className="bg-card border border-muted-foreground/10 rounded-3xl p-5 shadow-sm space-y-4"
                  >
                    {/* Card Top */}
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-muted-foreground">מזהה הזמנה:</span>
                        <h3 className="text-sm font-extrabold text-foreground">{order.id}</h3>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(order.status)}`}>
                        {getStatusLabel(order.status)}
                      </span>
                    </div>

                    {/* Customer Info */}
                    <div className="bg-muted/40 rounded-2xl p-3 text-xs space-y-1">
                      <p className="font-bold text-foreground">לקוח: <span className="font-semibold text-muted-foreground">{order.user_email}</span></p>
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
                    <div className="space-y-2 pt-2 border-t border-muted-foreground/5 flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <label className="text-[11px] font-extrabold text-muted-foreground block mb-1">מחיר סופי להזמנה (₪):</label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={typedPrices[order.id] !== undefined ? typedPrices[order.id] : String(order.amount_due || "")}
                            onChange={(e) => setTypedPrices(prev => ({ ...prev, [order.id]: e.target.value }))}
                            placeholder="הזן סכום לתשלום"
                            className="bg-background border border-muted-foreground/20 rounded-xl px-3 py-2 text-xs font-bold w-full focus:outline-none focus:ring-2 focus:ring-primary"
                          />

                        </div>
                      </div>
                      <div className="text-left min-w-[70px]">
                        <span className="text-[10px] font-bold text-muted-foreground block">מחיר נוכחי</span>
                        <span className="text-sm font-black text-foreground">
                          {order.amount_due ? `₪${order.amount_due}` : "טרם נקבע"}
                        </span>
                      </div>
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
                          className="bg-background border border-muted-foreground/20 rounded-xl px-3 py-2 text-[11px] font-semibold w-full focus:outline-none focus:ring-2 focus:ring-primary leading-normal resize-none"
                        />

                      </div>
                    </div>

                    {/* Action Select Box to transition state */}
                    <div className="space-y-2 pt-2 border-t border-muted-foreground/5">
                      <label className="text-[11px] font-extrabold text-muted-foreground block">עדכן סטטוס טיפול בכביסה:</label>
                      <div className="grid grid-cols-5 gap-1">
                        {[
                          { key: "pending", label: "ממתין" },
                          { key: "picked_up", label: "נאסף" },
                          { key: "in_progress", label: "בטיפול" },
                          { key: "ready", label: "מוכן" },
                          { key: "completed", label: "הושלם" }
                        ].map((step) => {
                          const isCurrent = (pendingStatuses[order.id] || order.status) === step.key;
                          return (
                            <button
                              key={step.key}
                              onClick={() => setPendingStatuses(prev => ({ ...prev, [order.id]: step.key }))}
                              className={`py-2 rounded-xl text-[10px] font-bold transition active:scale-95 border ${
                                isCurrent 
                                  ? "bg-primary text-primary-foreground border-primary" 
                                  : "bg-background text-muted-foreground border-muted-foreground/10 hover:bg-muted/50"
                              }`}
                            >
                              {step.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Already Uploaded Invoices */}
                    {order.invoices && order.invoices.length > 0 && (
                      <div className="space-y-1.5 pt-2 border-t border-muted-foreground/5">
                        <label className="text-[11px] font-extrabold text-muted-foreground block">חשבוניות שנשלחו ללקוח:</label>
                        <div className="space-y-1">
                          {order.invoices.map((inv, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-muted/30 hover:bg-muted/50 rounded-xl p-2.5 border border-muted-foreground/10 transition-colors">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-[11px] font-bold text-foreground truncate max-w-[130px]" title={inv.name}>📄 {inv.name}</span>
                                <span className="text-[9px] text-muted-foreground font-semibold">({new Date(inv.date).toLocaleDateString("he-IL")})</span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <a 
                                  href={inv.data} 
                                  download={inv.name}
                                  className="text-[10px] font-black text-primary hover:text-primary/80 bg-primary/10 px-2 py-1 rounded-lg transition active:scale-95"
                                >
                                  הורדה
                                </a>
                                <button
                                  type="button"
                                  onClick={() => deleteUploadedInvoice(order.id, order.user_email, inv.date, inv.name)}
                                  className="text-[10px] font-black text-destructive hover:text-destructive/80 bg-destructive/10 px-2 py-1 rounded-lg transition active:scale-95 flex items-center gap-0.5"
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
                        className="text-[11px] block w-full text-muted-foreground file:mr-0 file:ml-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-[10px] file:font-extrabold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 file:cursor-pointer cursor-pointer transition"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            setPendingInvoices(prev => ({ ...prev, [order.id]: e.target.files![0] }));
                            toast.info(`קובץ "${e.target.files[0].name}" נבחר — לחץ 'שמור את כל השינויים' לשליחה`);
                          }
                        }}
                      />
                      {pendingInvoices[order.id] && (
                        <div className="flex items-center justify-between bg-primary/5 rounded-xl p-2 mt-1 border border-primary/10">
                          <p className="text-[10px] text-primary font-bold">📎 {pendingInvoices[order.id]!.name} — ממתין לשמירה</p>
                          <button
                            type="button"
                            onClick={() => {
                              setPendingInvoices(prev => {
                                const n = { ...prev };
                                delete n[order.id];
                                return n;
                              });
                            }}
                            className="text-[10px] text-destructive hover:text-destructive/80 font-black flex items-center gap-0.5 bg-destructive/10 px-2 py-1 rounded-lg transition active:scale-95"
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
                        className="w-full bg-gradient-to-l from-primary to-primary/80 text-primary-foreground font-black text-sm py-4 rounded-2xl transition active:scale-[0.98] hover:shadow-lg hover:shadow-primary/20 flex items-center justify-center gap-2.5 disabled:opacity-60 disabled:cursor-not-allowed"
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
