import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { AppHeader } from "@/components/AppHeader";
import { useLaundry, stateLabel, ORDER_STEPS } from "@/lib/laundry-store";
import { ChevronRight, PackageOpen, Check, History, Loader2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/tracking")({ component: Tracking });

function Tracking() {
  const { 
    orderState, deliveryMethod, paymentState, amountDue, 
    orderNotes, orderImages, advanceOrder 
  } = useLaundry();
  
  const navigate = useNavigate();
  const currentIdx = ORDER_STEPS.findIndex((s) => s.key === orderState);

  return (
    <AppLayout>
      <AppHeader subtitle="מעקב" />
      <main className="px-5 mt-6 space-y-6 pb-20">
        {orderState === "none" ? (
          <div className="rounded-3xl bg-lavender/40 text-lavender-foreground p-8 text-center border border-lavender-foreground/5 shadow-sm">
            <PackageOpen className="size-12 mx-auto mb-3 opacity-60" strokeWidth={1.5} />
            <p className="font-semibold">אין הזמנות פעילות</p>
            <p className="text-sm opacity-70 mt-1">פתח הזמנה חדשה מהמסך הראשי</p>
            <button
              onClick={() => navigate({ to: "/" })}
              className="mt-5 rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold active:scale-95 transition"
            >
              חזרה לבית
            </button>
          </div>
        ) : (
          <div className="space-y-4 animate-fade-in">
            <div className="rounded-3xl bg-lime text-lime-foreground p-5 shadow-[0_15px_40px_-15px_oklch(0.92_0.18_125/0.6)]">
              <p className="text-xs font-semibold opacity-70">סטטוס נוכחי</p>
              <h2 className="text-xl font-extrabold mt-1">{stateLabel[orderState]}</h2>
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

              <button
                onClick={advanceOrder}
                disabled={orderState === "completed"}
                className="mt-5 w-full rounded-2xl bg-primary text-primary-foreground py-2.5 text-xs font-bold disabled:opacity-50 transition active:scale-[0.98] shadow-md shadow-primary/20"
              >
                {orderState === "completed" ? "ההזמנה הושלמה" : "קדם סטטוס (דמו)"}
              </button>
            </div>

            {/* Special Instructions (Notes & Images) Container */}
            {(() => {
              const [custNotes, laundryMsg] = (orderNotes || "").split(" ||LAUNDRY_MSG|| ");
              const hasNotes = custNotes && custNotes.trim().length > 0;
              const hasImages = orderImages && orderImages.length > 0;
              const hasLaundryMsg = laundryMsg && laundryMsg.trim().length > 0;

              if (!hasNotes && !hasImages && !hasLaundryMsg) return null;

              return (
                <div className="space-y-4 text-right animate-fade-in" dir="rtl">
                  {/* Customer Notes and Images Card */}
                  {(hasNotes || hasImages) && (
                    <div className="rounded-3xl bg-lavender text-lavender-foreground p-5 space-y-4 shadow-sm border border-lavender-foreground/5">
                      {hasNotes && (
                        <div>
                          <h3 className="font-extrabold text-xs mb-1 text-foreground">דגשים מיוחדים לכביסה:</h3>
                          <p className="text-xs opacity-90 leading-relaxed text-muted-foreground">{custNotes}</p>
                        </div>
                      )}
                      
                      {hasImages && (
                        <div>
                          <h3 className="font-extrabold text-xs mb-2 text-foreground">תמונות שצורפו:</h3>
                          <div className="flex gap-2 flex-wrap">
                            {orderImages.map((img, idx) => (
                              <div key={idx} className="relative size-14 rounded-2xl overflow-hidden border-2 border-background shadow-sm hover:scale-105 transition-transform cursor-pointer">
                                <img
                                  src={img}
                                  alt="דגש מיוחד"
                                  className="size-full object-cover"
                                  onClick={() => {
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

                  {/* Beautiful Laundry Message Notification Bubble */}
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
                      <p className="text-xs font-black text-foreground/90 leading-relaxed bg-white/50 p-3 rounded-2xl border border-lime/5">
                        {laundryMsg}
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="rounded-3xl bg-lavender text-lavender-foreground p-5 space-y-2 text-sm border border-lavender-foreground/5 shadow-sm animate-fade-in">
              <Row label="שיטת מסירה" value={
                deliveryMethod === "self_pickup" ? "איסוף עצמי" :
                deliveryMethod === "home_delivery" ? "משלוח הביתה" : "טרם נבחר"
              } />
              <Row label="סטטוס תשלום" value={paymentState === "paid" ? "שולם" : "ממתין לתשלום"} />
              <Row label="סכום" value={`₪${amountDue.toFixed(2)}`} />
            </div>

            {deliveryMethod === "none" && (
              <Link to="/delivery" className="block rounded-3xl bg-primary text-primary-foreground p-4 text-center font-bold shadow-md shadow-primary/20 hover:scale-[1.01] active:scale-95 transition">
                בחר שיטת מסירה
              </Link>
            )}
            {deliveryMethod !== "none" && paymentState === "unpaid" && (
              <Link to="/payments" className="block rounded-3xl bg-primary text-primary-foreground p-4 text-center font-bold shadow-md shadow-primary/20 hover:scale-[1.01] active:scale-95 transition">
                המשך לתשלום
              </Link>
            )}
          </div>
        )}

        {/* Previous Order History Section */}
        <OrderHistorySection orderState={orderState} />
      </main>
    </AppLayout>
  );
}

function OrderHistorySection({ orderState }: { orderState: string }) {
  const { user } = useLaundry();
  const [historyOrders, setHistoryOrders] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchHistory = async () => {
    if (!user) return;
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("user_email", user.email)
        .order("created_at", { ascending: false });

      if (data && !error) {
        // Filter out background profile sync orders
        setHistoryOrders(data.filter((o: any) => o.status !== "profile_sync"));
      }
    } catch (err) {
      console.error("Error fetching order history:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [user, orderState]);

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "picked_up": return "נאסף";
      case "in_progress": return "בטיפול";
      case "ready": return "מוכן";
      case "completed": return "הושלם";
      default: return "טרם נקבע";
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "picked_up": return "bg-blue-50 text-blue-700 border-blue-200/50";
      case "in_progress": return "bg-amber-50 text-amber-700 border-amber-200/50";
      case "ready": return "bg-emerald-50 text-emerald-700 border-emerald-200/50";
      case "completed": return "bg-gray-100 text-gray-700 border-gray-200";
      default: return "bg-slate-50 text-slate-600 border-slate-200";
    }
  };

  if (loadingHistory) {
    return (
      <div className="py-8 flex justify-center items-center gap-2">
        <Loader2 className="size-4 animate-spin text-primary" />
        <span className="text-xs text-muted-foreground">טוען היסטוריית הזמנות...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-6 border-t border-muted-foreground/10 text-right dir-rtl" dir="rtl">
      <div className="flex items-center gap-2 text-foreground font-black text-sm px-1">
        <History className="size-4 text-primary" />
        <span>היסטוריית ההזמנות שלי</span>
      </div>

      {historyOrders.length === 0 ? (
        <div className="bg-muted/30 border border-muted/50 rounded-3xl p-8 text-center text-xs text-muted-foreground leading-relaxed">
          אין היסטוריית הזמנות עדיין. ההזמנה הראשונה שלך תופיע כאן ברגע שתתחיל!
        </div>
      ) : (
        <div className="space-y-3">
          {historyOrders.map((order) => (
            <div key={order.id} className="bg-card border border-muted-foreground/10 rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-muted-foreground font-semibold block">מזהה הזמנה:</span>
                  <span className="text-xs font-bold text-foreground">#{order.id}</span>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadgeClass(order.status)}`}>
                  {getStatusLabel(order.status)}
                </span>
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
          ))}
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
