import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { AppHeader } from "@/components/AppHeader";
import { useLaundry, stateLabel, ORDER_STEPS } from "@/lib/laundry-store";
import { ChevronRight, PackageOpen, Check } from "lucide-react";
import { toast } from "sonner";

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
      <AppHeader subtitle="ההזמנות שלי / היסטוריה" />
      <main className="px-5 mt-6 space-y-4">
        {orderState === "none" ? (
          <div className="rounded-3xl bg-lavender text-lavender-foreground p-8 text-center">
            <PackageOpen className="size-12 mx-auto mb-3 opacity-60" strokeWidth={1.5} />
            <p className="font-semibold">אין הזמנות פעילות</p>
            <p className="text-sm opacity-70 mt-1">פתח הזמנה חדשה מהמסך הראשי</p>
            <button
              onClick={() => navigate({ to: "/" })}
              className="mt-5 rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold"
            >
              חזרה לבית
            </button>
          </div>
        ) : (
          <>
            <div className="rounded-3xl bg-lime text-lime-foreground p-5">
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
                className="mt-5 w-full rounded-2xl bg-primary text-primary-foreground py-2.5 text-xs font-bold disabled:opacity-50 transition active:scale-[0.98]"
              >
                {orderState === "completed" ? "ההזמנה הושלמה" : "קדם סטטוס (דמו)"}
              </button>
            </div>

            {/* Special Instructions (Notes & Images) Container */}
            {(orderNotes || (orderImages && orderImages.length > 0)) && (
              <div className="rounded-3xl bg-lavender text-lavender-foreground p-5 space-y-4 shadow-sm border border-lavender-foreground/5 text-right" dir="rtl">
                {orderNotes && (
                  <div>
                    <h3 className="font-extrabold text-xs mb-1 text-foreground">דגשים מיוחדים לכביסה:</h3>
                    <p className="text-xs opacity-90 leading-relaxed text-muted-foreground">{orderNotes}</p>
                  </div>
                )}
                
                {orderImages && orderImages.length > 0 && (
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

            <div className="rounded-3xl bg-lavender text-lavender-foreground p-5 space-y-2 text-sm">
              <Row label="שיטת מסירה" value={
                deliveryMethod === "self_pickup" ? "איסוף עצמי" :
                deliveryMethod === "home_delivery" ? "משלוח הביתה" : "טרם נבחר"
              } />
              <Row label="סטטוס תשלום" value={paymentState === "paid" ? "שולם" : "ממתין לתשלום"} />
              <Row label="סכום" value={`₪${amountDue.toFixed(2)}`} />
            </div>

            {deliveryMethod === "none" && (
              <Link to="/delivery" className="block rounded-3xl bg-primary text-primary-foreground p-4 text-center font-semibold">
                בחר שיטת מסירה
              </Link>
            )}
            {deliveryMethod !== "none" && paymentState === "unpaid" && (
              <Link to="/payments" className="block rounded-3xl bg-primary text-primary-foreground p-4 text-center font-semibold">
                המשך לתשלום
              </Link>
            )}
          </>
        )}
      </main>
    </AppLayout>
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
