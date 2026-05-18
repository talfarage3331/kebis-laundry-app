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
  status: "picked_up" | "in_progress" | "ready" | "completed";
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
      // Fetch orders from Supabase
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // If there are no real orders, let's inject a couple of mock orders to make it feel rich and complete!
      // But we will always display the real orders too.
      const realOrders = (data || [])
        .filter((o: any) => 
          o.delivery_method !== "placeholder" && 
          !(o.delivery_method || "").startsWith("PROFILE_SYNC:")
        )
        .map((o: any) => ({
          id: o.id,
          created_at: o.created_at || new Date().toISOString(),
          status: o.status,
          delivery_method: o.delivery_method,
          payment_state: o.payment_state,
          amount_due: o.amount_due,
          user_email: o.user_email,
          notes: o.notes || localStorage.getItem(`laundry_notes_${o.user_email}`) || localStorage.getItem("laundry_notes") || "כביסה רגילה, נא לתלות חולצות מכופתרות",
          images: o.images || JSON.parse(localStorage.getItem(`laundry_images_${o.user_email}`) || localStorage.getItem("laundry_images") || "[]"),
          requires_ironing: o.requires_ironing || localStorage.getItem(`laundry_ironing_${o.user_email}`) === "true",
          requires_dry_cleaning: o.requires_dry_cleaning || localStorage.getItem(`laundry_dry_cleaning_${o.user_email}`) === "true"
        }));

      // If we don't have any real active order or if the list is empty, let's create high-fidelity sample orders
      const mockOrders: LaundryOrder[] = [
        {
          id: "ORD-9821",
          created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
          status: "picked_up",
          delivery_method: "home_delivery",
          payment_state: "unpaid",
          amount_due: 125,
          user_email: "client_yoav@gmail.com",
          notes: "נא לשטוף בטמפרטורה נמוכה. יש חליפה עדינה מאוד שדורשת ניקוי עדין.",
          images: [],
          requires_ironing: false,
          requires_dry_cleaning: true
        },
        {
          id: "ORD-7643",
          created_at: new Date(Date.now() - 5 * 3600000).toISOString(),
          status: "in_progress",
          delivery_method: "self_pickup",
          payment_state: "paid",
          amount_due: 95,
          user_email: "dan_m@hotmail.com",
          notes: "להפריד בבקשה את המצעים הלבנים משאר הכביסה. תודה!",
          images: [],
          requires_ironing: true,
          requires_dry_cleaning: true
        }
      ];

      setOrders([...realOrders, ...mockOrders]);
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

  const updateOrderStatus = async (orderId: string, newStatus: "picked_up" | "in_progress" | "ready" | "completed") => {
    // If it's a mock order (starts with ORD-), we just update the UI state!
    if (orderId.startsWith("ORD-")) {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
      toast.success("סטטוס ההזמנה עודכן בהצלחה!");
      return;
    }

    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: newStatus })
        .eq("id", orderId);

      if (error) throw error;
      
      toast.success("סטטוס ההזמנה עודכן בהצלחה בשרת!");
      fetchOrders();
    } catch (err: any) {
      toast.error("שגיאה בעדכון הסטטוס: " + err.message);
    }
  };

  const updateOrderPrice = async (orderId: string, newPrice: number) => {
    if (orderId.startsWith("ORD-")) {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, amount_due: newPrice } : o));
      toast.success("מחיר ההזמנה הסימולטיבית עודכן בהצלחה!");
      return;
    }

    try {
      const { error } = await supabase
        .from("orders")
        .update({ amount_due: newPrice, total_price: newPrice })
        .eq("id", orderId);

      if (error) throw error;
      
      toast.success("מחיר ההזמנה עודכן בשרת בהצלחה!");
      
      // Emit system-update notification event to trigger dynamic price updates on client screen
      const newNotification = {
        id: "price-update-" + orderId + "-" + Date.now(),
        user_email: "system-update",
        notes: `מחיר עודכן ל-₪${newPrice}`,
        timestamp: new Date().toLocaleTimeString("he-IL")
      };
      const existing = JSON.parse(localStorage.getItem("laundry_notifications") || "[]");
      localStorage.setItem("laundry_notifications", JSON.stringify([newNotification, ...existing]));
      window.dispatchEvent(new Event("storage"));

      fetchOrders();
    } catch (err: any) {
      toast.error("שגיאה בעדכון המחיר: " + err.message);
    }
  };

  const updateOrderMessage = async (orderId: string, newMessage: string) => {
    if (orderId.startsWith("ORD-")) {
      setOrders(prev => prev.map(o => {
        if (o.id === orderId) {
          const [custNotes] = (o.notes || "").split(" ||LAUNDRY_MSG|| ");
          const combined = custNotes + " ||LAUNDRY_MSG|| " + newMessage;
          return { ...o, notes: combined };
        }
        return o;
      }));
      toast.success("הודעת המכבסה הסימולטיבית עודכנה בהצלחה!");
      return;
    }

    try {
      // 1. Fetch current order notes to preserve the customer's original notes
      const { data: orderData, error: fetchErr } = await supabase
        .from("orders")
        .select("notes")
        .eq("id", orderId)
        .maybeSingle();

      if (fetchErr) throw fetchErr;

      const currentNotes = orderData?.notes || "";
      const [custNotes] = currentNotes.split(" ||LAUNDRY_MSG|| ");
      const combined = custNotes.trim() + " ||LAUNDRY_MSG|| " + newMessage.trim();

      const { error } = await supabase
        .from("orders")
        .update({ notes: combined })
        .eq("id", orderId);

      if (error) throw error;
      
      toast.success("הודעת המכבסה עודכנה בהצלחה בשרת!");
      fetchOrders();
    } catch (err: any) {
      toast.error("שגיאה בעדכון ההודעה: " + err.message);
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "picked_up": return "נאסף";
      case "in_progress": return "בטיפול";
      case "ready": return "מוכן";
      case "completed": return "הושלם";
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
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
          <section className="grid grid-cols-4 gap-2">
            {[
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
                            <p className="text-xs bg-lavender/20 text-muted-foreground p-3 rounded-2xl leading-relaxed border border-lavender-foreground/5 font-semibold">
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
                      <div className="grid grid-cols-4 gap-1">
                        {[
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
