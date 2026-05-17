import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useLaundry } from "@/lib/laundry-store";
import { ArrowRight, FileText, Download, CreditCard, Smartphone, Apple, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/payments")({ component: Payments });

const methods = [
  { id: "credit", label: "כרטיס אשראי", Icon: CreditCard },
  { id: "bit", label: "Bit", Icon: Smartphone },
  { id: "apple", label: "Apple Pay", Icon: Apple },
  { id: "google", label: "Google Pay", Icon: Wallet },
] as const;

import { useEffect } from "react";
import { Sparkles } from "lucide-react";

function Payments() {
  const { amountDue, invoices, payAndInvoice, paymentState, refreshActiveOrder } = useLaundry();
  const navigate = useNavigate();
  const [method, setMethod] = useState<string>("credit");
  const [whatsapp, setWhatsapp] = useState(true);
  const [email, setEmail] = useState(false);

  // Poll for price changes if the price is currently unset or 0
  useEffect(() => {
    refreshActiveOrder();

    // Set up polling interval to check for price updates in background (cross-device/tab fallback)
    const interval = setInterval(() => {
      if (amountDue <= 0 && paymentState !== "paid") {
        refreshActiveOrder();
      }
    }, 4000);

    // Listen to real-time storage event (cross-tab local speed trigger)
    const handleStorage = () => {
      refreshActiveOrder();
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      clearInterval(interval);
      window.removeEventListener("storage", handleStorage);
    };
  }, [amountDue, paymentState, refreshActiveOrder]);

  const handlePay = () => {
    if (amountDue <= 0) {
      toast.info("אין סכום לתשלום");
      return;
    }
    payAndInvoice();
    toast.success("התשלום בוצע בהצלחה! החשבונית נוצרה.");
  };

  const isPricePending = amountDue <= 0 && paymentState !== "paid";

  return (
    <AppLayout>
      <header className="bg-primary text-primary-foreground rounded-b-[2rem] px-5 pt-6 pb-10 relative">
        <button onClick={() => navigate({ to: "/" })} className="absolute top-6 left-5 size-10 grid place-items-center rounded-full bg-primary-foreground/15">
          <ArrowRight className="size-5" strokeWidth={2} />
        </button>
        <h1 className="text-3xl font-extrabold mt-8">תשלום וחשבוניות</h1>
      </header>

      <main className="px-5 mt-6 space-y-4 pb-4">
        {/* Price Card */}
        <div className={`rounded-3xl p-5 shadow-sm border transition-all duration-500 ${
          isPricePending 
            ? "bg-slate-50 border-slate-200 text-slate-700" 
            : "bg-lime text-lime-foreground border-lime/20 shadow-[0_15px_40px_-15px_oklch(0.92_0.18_125/0.6)] animate-fade-in"
        }`}>
          <p className="text-sm font-semibold opacity-70">
            {isPricePending ? "ממתין לעדכון סכום מהמכבסה" : "סכום לתשלום"}
          </p>
          <p className="text-4xl font-extrabold mt-1">
            {isPricePending ? "₪0.00" : `₪${amountDue.toFixed(2)}`}
          </p>
          {paymentState === "paid" && <p className="text-xs font-bold mt-2 text-primary">✓ שולם</p>}
        </div>

        {/* Dynamic Pricing Banner & Conditional Payment Methods */}
        {isPricePending ? (
          <div className="bg-lavender/30 border border-lavender-foreground/10 rounded-3xl p-6 text-center space-y-4 animate-pulse">
            <div className="size-14 bg-lavender/80 rounded-full grid place-items-center mx-auto shadow-sm">
              <Sparkles className="size-7 text-primary animate-spin duration-3000" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-extrabold text-foreground">המכבסה מעדכנת את סכום ההזמנה</h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed px-4">אפשרות התשלום תפתח בקרוב ברגע שצוות המכבסה יסיים לשקול ולתמחר את הכביסה שלך.</p>
            </div>
            <div className="flex items-center justify-center gap-1.5 text-[9px] font-black text-primary bg-primary/10 py-1.5 px-3 rounded-full w-fit mx-auto">
              <span className="size-1.5 bg-primary rounded-full animate-ping" />
              <span>בודק סטטוס תמחור בזמן אמת...</span>
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-3xl border border-border p-5 animate-fade-in">
              <h3 className="font-bold mb-3">אמצעי תשלום</h3>
              <div className="space-y-2">
                {methods.map(({ id, label, Icon }) => (
                  <label
                    key={id}
                    className={`flex items-center gap-3 rounded-2xl px-4 py-3 cursor-pointer transition ${
                      method === id ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}
                  >
                    <input
                      type="radio"
                      name="pm"
                      className="sr-only"
                      checked={method === id}
                      onChange={() => setMethod(id)}
                    />
                    <Icon className="size-5" strokeWidth={1.75} />
                    <span className="font-semibold flex-1">{label}</span>
                    <span className={`size-4 rounded-full border-2 ${method === id ? "bg-primary-foreground border-primary-foreground" : "border-muted-foreground"}`} />
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={handlePay}
              className="w-full rounded-3xl bg-primary text-primary-foreground py-5 text-lg font-extrabold shadow-[0_15px_40px_-15px_oklch(0.34_0.13_333/0.6)] active:scale-[0.98] transition animate-fade-in"
            >
              בצע תשלום וקבל חשבונית
            </button>
          </>
        )}

        <div className="rounded-3xl bg-lavender text-lavender-foreground p-5">
          <h3 className="font-bold mb-3">חשבוניות אחרונות</h3>
          {invoices.length === 0 ? (
            <p className="text-sm opacity-70">אין חשבוניות עדיין</p>
          ) : (
            <ul className="space-y-2">
              {invoices.map((inv) => (
                <li key={inv.id}>
                  <button
                    onClick={() => toast.success(`מוריד הזמנה ${inv.id} (PDF)`)}
                    className="w-full flex items-center justify-between bg-background/60 rounded-2xl px-4 py-3 text-sm"
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      <FileText className="size-4" strokeWidth={1.75} />
                      הזמנה {inv.id} (PDF)
                    </span>
                    <Download className="size-4 opacity-70" strokeWidth={1.75} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-3xl border border-border p-5 space-y-3">
          <h3 className="font-bold">שליחת חשבונית</h3>
          <div className="flex items-center justify-between">
            <span className="text-sm">שלח לוואטסאפ (WhatsApp)</span>
            <Switch checked={whatsapp} onCheckedChange={setWhatsapp} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">שלח למייל</span>
            <Switch checked={email} onCheckedChange={setEmail} />
          </div>
        </div>
      </main>
    </AppLayout>
  );
}
