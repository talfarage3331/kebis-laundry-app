import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useLaundry, ORDER_STEPS, stateLabel } from "@/lib/laundry-store";
import { supabase } from "@/lib/supabase";
import { 
  ShoppingBasket, Truck, Sparkles, CheckCircle2, AlertCircle, 
  ArrowLeft, LogOut, RefreshCw, MessageSquare, Image as ImageIcon, ChevronDown 
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
}

function LaundryDashboard() {
  const { user, logout } = useLaundry();
  const navigate = useNavigate();
  
  const [orders, setOrders] = useState<LaundryOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("active");
  const [typedPrices, setTypedPrices] = useState<Record<string, string>>({});
  const [typedMessages, setTypedMessages] = useState<Record<string, string>>({});

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch from Orders table (in case RLS ever allows it or Admin is logged in)
      const { data: dbOrders, error: dbErr } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      const realOrders = (dbOrders || [])
        .filter((o: any) => 
          o.delivery_method !== "placeholder" && 
          !(o.delivery_method || "").startsWith("PROFILE_SYNC:")
        ).map((o: any) => ({
          id: o.id,
          created_at: o.created_at || new Date().toISOString(),
          status: o.status,
          delivery_method: o.delivery_method,
          payment_state: o.payment_state,
          amount_due: o.amount_due,
          user_email: o.user_email,
          notes: o.notes || localStorage.getItem(`laundry_notes_${o.user_email}`) || localStorage.getItem("laundry_notes") || "",
          images: o.images || JSON.parse(localStorage.getItem(`laundry_images_${o.user_email}`) || localStorage.getItem("laundry_images") || "[]"),
          requires_ironing: o.requires_ironing || localStorage.getItem(`laundry_ironing_${o.user_email}`) === "true",
          requires_dry_cleaning: o.requires_dry_cleaning || localStorage.getItem(`laundry_dry_cleaning_${o.user_email}`) === "true"
        }));

      // 2. Fetch from Profiles global registry (to completely bypass strict RLS limits on orders table)
      const { data: allProfiles } = await supabase
        .from("profiles")
        .select("*");

      const globalOrders: LaundryOrder[] = [];
      (allProfiles || []).forEach(p => {
        try {
          if (p.avatar_url) {
            const parsed = JSON.parse(p.avatar_url);
            if (parsed) {
              const ordersToAdd = [];
              if (parsed.active_order) {
                ordersToAdd.push(parsed.active_order);
              }
              if (parsed.orders && Array.isArray(parsed.orders)) {
                ordersToAdd.push(...parsed.orders);
              }
              
              ordersToAdd.forEach((o: any) => {
                // Check if order is already fulfilled/completed to prevent ghost orders showing forever
                if (o.status !== "completed" && o.status !== "none") {
                  globalOrders.push({
                    id: o.id,
                    created_at: o.created_at || o.timestamp || new Date().toISOString(),
                    status: o.status,
                    delivery_method: o.delivery_method,
                    payment_state: o.payment_state,
                    amount_due: o.amount_due,
                    user_email: o.user_email,
                    notes: o.notes || localStorage.getItem(`laundry_notes_${o.user_email}`) || localStorage.getItem("laundry_notes") || "",
                    images: o.images || JSON.parse(localStorage.getItem(`laundry_images_${o.user_email}`) || "[]"),
                    requires_ironing: o.requires_ironing || localStorage.getItem(`laundry_ironing_${o.user_email}`) === "true",
                    requires_dry_cleaning: o.requires_dry_cleaning || localStorage.getItem(`laundry_dry_cleaning_${o.user_email}`) === "true"
                  });
                }
              });
            }
          }
        } catch (e) {}
      });

      // Merge both sources and remove duplicates based on ID
      const mergedRaw = [...realOrders, ...globalOrders];
      const mergedMap = new Map();
      mergedRaw.forEach(o => {
        if (!mergedMap.has(o.id)) mergedMap.set(o.id, o);
      });
      const finalOrders = Array.from(mergedMap.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setOrders(finalOrders);
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

          fetchOrders();
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // Real-time: listen for ANY profile avatar_url changes (customers pushing order snapshots)
  useEffect(() => {
    const sub = supabase
      .channel('laundry-profiles-sync')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        () => {
          // A customer's profile changed — re-fetch all orders from the global registry
          fetchOrders();
        }
      )
      .subscribe();

    return () => { sub.unsubscribe(); };
  }, []);

  const updateOrderStatus = async (orderId: string, newStatus: "pending" | "picked_up" | "in_progress" | "ready" | "completed") => {
    try {
      // 1. Try DB first (works if Admin or RLS permits)
      await supabase.from("orders").update({ status: newStatus }).eq("id", orderId);

      // 2. Regardless of DB error, persist override to Laundry user's own profile registry
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: myProf } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
        let signals: any = {};
        if (myProf?.avatar_url) {
          try { signals = JSON.parse(myProf.avatar_url); } catch(e) {}
        }
        
        const targetOrder = orders.find(o => o.id === orderId);
        if (targetOrder) {
          if (!signals.status_overrides) signals.status_overrides = {};
          signals.status_overrides[targetOrder.user_email] = newStatus;
          signals.status_overrides[orderId] = newStatus;
          
          if (signals.active_order && signals.active_order.id === orderId) {
            signals.active_order.status = newStatus;
          }
          if (signals.orders && Array.isArray(signals.orders)) {
            const idx = signals.orders.findIndex((o: any) => o.id === orderId);
            if (idx >= 0) signals.orders[idx].status = newStatus;
          }

          await supabase.from("profiles").update({ avatar_url: JSON.stringify(signals) }).eq("id", session.user.id);
        }
      }

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
      await supabase.from("orders").update({ amount_due: newPrice, total_price: newPrice }).eq("id", orderId);

      // Persist to Laundry registry
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: myProf } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
        let signals: any = {};
        if (myProf?.avatar_url) {
          try { signals = JSON.parse(myProf.avatar_url); } catch(e) {}
        }
        
        const targetOrder = orders.find(o => o.id === orderId);
        if (targetOrder) {
          if (!signals.price_overrides) signals.price_overrides = {};
          signals.price_overrides[targetOrder.user_email] = newPrice;
          signals.price_overrides[orderId] = newPrice;
          
          if (signals.active_order && signals.active_order.id === orderId) {
            signals.active_order.amount_due = newPrice;
            signals.active_order.total_price = newPrice;
          }
          if (signals.orders && Array.isArray(signals.orders)) {
            const idx = signals.orders.findIndex((o: any) => o.id === orderId);
            if (idx >= 0) {
              signals.orders[idx].amount_due = newPrice;
              signals.orders[idx].total_price = newPrice;
            }
          }

          await supabase.from("profiles").update({ avatar_url: JSON.stringify(signals) }).eq("id", session.user.id);
        }
      }

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

      await supabase.from("orders").update({ notes: combined }).eq("id", orderId);

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: myProf } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
        let signals: any = {};
        if (myProf?.avatar_url) {
          try { signals = JSON.parse(myProf.avatar_url); } catch(e) {}
        }
        
        if (targetOrder) {
          if (!signals.msg_overrides) signals.msg_overrides = {};
          signals.msg_overrides[targetOrder.user_email] = combined;
          signals.msg_overrides[orderId] = combined;
          
          if (signals.active_order && signals.active_order.id === orderId) {
            signals.active_order.notes = combined;
          }
          if (signals.orders && Array.isArray(signals.orders)) {
            const idx = signals.orders.findIndex((o: any) => o.id === orderId);
            if (idx >= 0) signals.orders[idx].notes = combined;
          }

          await supabase.from("profiles").update({ avatar_url: JSON.stringify(signals) }).eq("id", session.user.id);
        }
      }

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
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            const { data: myProf } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
            let signals: any = {};
            if (myProf?.avatar_url) {
              try { signals = JSON.parse(myProf.avatar_url); } catch(e) {}
            }
            if (!signals.invoices) signals.invoices = {};
            if (!signals.invoices[targetOrder.user_email]) signals.invoices[targetOrder.user_email] = [];
            
            signals.invoices[targetOrder.user_email].push({
              id: orderId,
              date: new Date().toISOString(),
              name: file.name,
              data: base64data
            });
            
            await supabase.from("profiles").update({ avatar_url: JSON.stringify(signals) }).eq("id", session.user.id);
            toast.success("החשבונית צורפה ונשלחה ללקוח!");
            localStorage.setItem("laundry_sync_trigger", Date.now().toString());
            window.dispatchEvent(new Event("storage"));
          }
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      toast.error("שגיאה בהעלאת חשבונית: " + err.message);
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
                onClick={fetchOrders}
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
                            <div key={idx} className="relative size-14 rounded-xl overflow-hidden border border-muted-foreground/10 hover:scale-105 transition-transform cursor-pointer">
                              <img src={img} alt="תצוגת דגש" className="size-full object-cover" onClick={() => toast.info("תמונה מצורפת מהלקוח")} />
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
                          <button
                            onClick={() => updateOrderPrice(order.id, Number(typedPrices[order.id] || 0))}
                            className="bg-primary text-primary-foreground font-bold text-[11px] px-3.5 py-2 rounded-xl transition active:scale-95 whitespace-nowrap"
                          >
                            עדכן מחיר
                          </button>
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
                        <button
                          onClick={() => updateOrderMessage(order.id, typedMessages[order.id] || "")}
                          className="bg-lime text-lime-foreground hover:shadow-md font-extrabold text-[10px] px-3 py-2 rounded-xl transition active:scale-95 flex items-center justify-center self-end h-10"
                        >
                          שלח הודעה
                        </button>
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
                          const isCurrent = order.status === step.key;
                          return (
                            <button
                              key={step.key}
                              onClick={() => updateOrderStatus(order.id, step.key as any)}
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

                    {/* Upload Invoice */}
                    <div className="space-y-2 pt-2 border-t border-muted-foreground/5">
                      <label className="text-[11px] font-extrabold text-muted-foreground block">צירוף ושליחת חשבונית:</label>
                      <input 
                        type="file" 
                        accept="application/pdf,image/*"
                        className="text-[11px] block w-full text-muted-foreground file:mr-0 file:ml-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-[10px] file:font-extrabold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 file:cursor-pointer cursor-pointer transition"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            uploadInvoice(order.id, e.target.files[0]);
                          }
                        }}
                      />
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
