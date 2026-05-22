import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { AppHeader } from "@/components/AppHeader";
import { useLaundry, stateLabel, ORDER_STEPS } from "@/lib/laundry-store";
import { PackageOpen, Check, Loader2, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/tracking")({ component: Tracking });

function Tracking() {
  const { user, orderState } = useLaundry();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchOrders = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("user_email", user.email)
        .order("created_at", { ascending: false });

      let fetchedOrders = [];
      if (data && !error) {
        fetchedOrders = data.filter((o: any) => o.status !== "profile_sync" && o.delivery_method !== "placeholder" && !(o.delivery_method || "").startsWith("PROFILE_SYNC:"));
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: myProf } = await supabase.from("profiles").select("avatar_url").eq("id", session.user.id).maybeSingle();
        if (myProf?.avatar_url) {
          try {
            const signals = JSON.parse(myProf.avatar_url);
            
            // Merge active_order
            if (signals.active_order) {
              const existingIdx = fetchedOrders.findIndex(o => o.id === signals.active_order.id);
              if (existingIdx === -1) {
                fetchedOrders.push(signals.active_order);
              } else {
                fetchedOrders[existingIdx] = { ...fetchedOrders[existingIdx], ...signals.active_order };
              }
            }
            // Merge orders array if it exists
            if (signals.orders && Array.isArray(signals.orders)) {
              signals.orders.forEach((o: any) => {
                const existingIdx = fetchedOrders.findIndex(existing => existing.id === o.id);
                if (existingIdx === -1) {
                  fetchedOrders.push(o);
                } else {
                  fetchedOrders[existingIdx] = { ...fetchedOrders[existingIdx], ...o };
                }
              });
            }
          } catch(e) {}
        }
      }

      // Filter out completed orders from being displayed in tracking
      fetchedOrders = fetchedOrders.filter(o => o.status !== "completed");

      // Sort explicitly so fallback items are placed correctly
      fetchedOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setOrders(fetchedOrders);
      if (fetchedOrders.length > 0 && !expandedId) {
        setExpandedId(fetchedOrders[0].id);
      }
    } catch (err) {
      console.error("Error fetching orders:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();

    // Listen for realtime admin updates via DB
    const sub = supabase
      .channel('tracking-profiles-sync')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        () => fetchOrders()
      )
      .subscribe();

    // Listen for local tab changes (if admin is on same machine/browser)
    const handleStorage = () => fetchOrders();
    window.addEventListener("storage", handleStorage);

    return () => {
      sub.unsubscribe();
      window.removeEventListener("storage", handleStorage);
    };
  }, [user, orderState]);

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
            {orders.map((order) => (
              <OrderCard 
                key={order.id} 
                order={order} 
                isExpanded={expandedId === order.id} 
                onToggle={() => setExpandedId(expandedId === order.id ? null : order.id)} 
              />
            ))}
            <div className="text-[10px] text-muted-foreground opacity-30 mt-8 text-center" dir="ltr">
              Debug IDs: {orders.length} - {JSON.stringify(orders.map(o => o.id))}
            </div>
          </div>
        )}
      </main>
    </AppLayout>
  );
}

function OrderCard({ order, isExpanded, onToggle }: { order: any, isExpanded: boolean, onToggle: () => void }) {
  const currentIdx = ORDER_STEPS.findIndex((s) => s.key === order.status);
  
  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending": return "ממתין לאיסוף";
      case "picked_up": return "נאסף";
      case "in_progress": return "בטיפול";
      case "ready": return "מוכן";
      case "completed": return "הושלם";
      default: return "טרם נקבע";
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "pending": return "bg-purple-50 text-purple-700 border-purple-200/50";
      case "picked_up": return "bg-blue-50 text-blue-700 border-blue-200/50";
      case "in_progress": return "bg-amber-50 text-amber-700 border-amber-200/50";
      case "ready": return "bg-emerald-50 text-emerald-700 border-emerald-200/50";
      case "completed": return "bg-gray-100 text-gray-700 border-gray-200";
      default: return "bg-slate-50 text-slate-600 border-slate-200";
    }
  };

  const [custNotes, laundryMsg] = (order.notes || "").split(" ||LAUNDRY_MSG|| ");
  const hasNotes = custNotes && custNotes.trim().length > 0;
  
  let parsedImages: string[] = [];
  if (order.images) {
    try { parsedImages = typeof order.images === 'string' ? JSON.parse(order.images) : order.images; } catch(e){}
  }
  const hasImages = parsedImages && parsedImages.length > 0;
  const hasLaundryMsg = laundryMsg && laundryMsg.trim().length > 0;

  if (isExpanded) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="rounded-3xl bg-lime text-lime-foreground p-5 shadow-[0_15px_40px_-15px_oklch(0.92_0.18_125/0.6)] relative cursor-pointer" onClick={onToggle}>
          <div className="flex justify-between items-center text-xs opacity-80 mb-3 font-bold border-b border-current/20 pb-2">
            <span className="text-sm">הזמנה #{order.id.split('-')[0]}</span>
            <span>{new Date(order.created_at).toLocaleDateString("he-IL")}</span>
          </div>
          <div className="absolute left-5 top-5 bg-black/10 rounded-full p-1 transition-transform hover:bg-black/20">
            <ChevronUp className="size-5" />
          </div>
          <p className="text-xs font-semibold opacity-70 mt-4">סטטוס נוכחי</p>
          <h2 className="text-xl font-extrabold mt-1">{stateLabel[order.status as keyof typeof stateLabel] || getStatusLabel(order.status)}</h2>
          <ol className="mt-4 space-y-2">
            {ORDER_STEPS.map((s, i) => {
              const done = i <= currentIdx;
              return (
                <li key={s.key} className="flex items-center gap-3 text-sm font-semibold">
                  <span
                    className={`size-6 rounded-full grid place-items-center text-[11px] ${
                      done ? "bg-primary text-primary-foreground" : "bg-background/60 text-muted-foreground"
                    }`}
                  >
                    {done ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
                  </span>
                  {s.label}
                </li>
              );
            })}
          </ol>
        </div>

        {(hasNotes || hasImages || hasLaundryMsg) && (
          <div className="space-y-4 animate-fade-in">
            {(hasNotes || hasImages) && (
              <div className="rounded-3xl bg-lavender text-lavender-foreground p-5 space-y-4 shadow-sm border border-lavender-foreground/5">
                {hasNotes && (
                  <div>
                    <h3 className="font-extrabold text-xs mb-1 text-foreground">דגשים מיוחדים לכביסה:</h3>
                    <p className="text-xs opacity-90 leading-relaxed text-muted-foreground whitespace-pre-wrap">{custNotes}</p>
                  </div>
                )}
                {hasImages && (
                  <div>
                    <h3 className="font-extrabold text-xs mb-2 text-foreground">תמונות שצורפו:</h3>
                    <div className="flex gap-2 flex-wrap">
                      {parsedImages.map((img, idx) => (
                        <div key={idx} className="relative size-14 rounded-2xl overflow-hidden border-2 border-background shadow-sm hover:scale-105 transition-transform cursor-pointer">
                          <img src={img} alt="דגש" className="size-full object-cover" onClick={(e) => { e.stopPropagation(); toast.info("תמונה מצורפת לכביסה"); }} />
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
                    <h3 className="font-extrabold text-xs text-lime-foreground">עדכון והודעה מהמכבסה:</h3>
                    <span className="text-[9px] font-bold text-muted-foreground">הודעה רשמית מצוות המכבסה</span>
                  </div>
                </div>
                <p className="text-xs font-black text-foreground/90 leading-relaxed bg-white/50 p-3 rounded-2xl border border-lime/5 break-words whitespace-pre-wrap">
                  {laundryMsg}
                </p>
              </div>
            )}
          </div>
        )}

        <div className="rounded-3xl bg-lavender text-lavender-foreground p-5 space-y-2 text-sm border border-lavender-foreground/5 shadow-sm animate-fade-in">
          <Row label="שיטת מסירה" value={
            order.delivery_method === "self_pickup" ? "איסוף עצמי" :
            order.delivery_method === "home_delivery" ? "משלוח הביתה" : "טרם נבחר"
          } />
          <Row label="סטטוס תשלום" value={order.payment_state === "paid" ? "שולם" : "ממתין לתשלום"} />
          <Row label="סכום" value={`₪${(order.amount_due || 0).toFixed(2)}`} />
        </div>

        {order.delivery_method === "none" && order.status !== "completed" && (
          <Link to="/delivery" className="block rounded-3xl bg-primary text-primary-foreground p-4 text-center font-bold shadow-md shadow-primary/20 hover:scale-[1.01] active:scale-95 transition">
            בחר שיטת מסירה
          </Link>
        )}
        {order.delivery_method !== "none" && order.payment_state === "unpaid" && order.status !== "completed" && (
          <Link to="/payments" className="block rounded-3xl bg-primary text-primary-foreground p-4 text-center font-bold shadow-md shadow-primary/20 hover:scale-[1.01] active:scale-95 transition">
            המשך לתשלום
          </Link>
        )}
      </div>
    );
  }

  return (
    <div 
      onClick={onToggle}
      className="bg-card border border-muted-foreground/10 rounded-2xl p-4 shadow-sm space-y-3 cursor-pointer hover:bg-muted/30 transition active:scale-[0.99]"
    >
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] text-muted-foreground font-semibold block">מזהה הזמנה:</span>
          <span className="text-xs font-bold text-foreground">#{order.id.split('-')[0]}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadgeClass(order.status)}`}>
            {getStatusLabel(order.status)}
          </span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px] bg-muted/40 p-2.5 rounded-xl">
        <div>
          <span className="text-muted-foreground block">שיטת מסירה:</span>
          <span className="font-semibold text-foreground">
            {order.delivery_method === "home_delivery" ? "משלוח הביתה" : order.delivery_method === "self_pickup" ? "איסוף עצמי" : "טרם נקבע"}
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
          <span className={`text-[10px] font-bold ${order.payment_state === "paid" ? "text-emerald-600" : "text-amber-600"}`}>
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
