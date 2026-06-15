import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useLaundry, normalizeStatus } from "@/lib/laundry-store";
import {
  ArrowRight,
  FileText,
  Download,
  CreditCard,
  Smartphone,
  Apple,
  Wallet,
  Sparkles,
  Loader2,
  PackageOpen,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, doc, updateDoc } from "firebase/firestore";

export const Route = createFileRoute("/payments")({ component: Payments });

const methods = [
  { id: "bit", label: "Bit", Icon: Smartphone },
  { id: "credit", label: "כרטיס אשראי", Icon: CreditCard },
  { id: "apple", label: "Apple Pay", Icon: Apple },
  { id: "google", label: "Google Pay", Icon: Wallet },
] as const;

function Payments() {
  const { user, invoices } = useLaundry();
  const navigate = useNavigate();
  const [method, setMethod] = useState<string>("bit");

  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(true);
      return;
    }

    const q = query(collection(db, "orders"), where("user_email", "==", user.email));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const activeOrders = snapshot.docs
          .map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              created_at: data.created_at || data.createdAt || new Date().toISOString(),
              status: data.status,
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
              images: data.images || [],
            };
          })
          .filter(
            (o) =>
              o.delivery_method !== "placeholder" &&
              !o.id.startsWith("placeholder") &&
              o.status !== "completed" &&
              o.payment_state !== "paid",
          );

        // Sort desc client-side
        activeOrders.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );

        setOrders(activeOrders);
        setLoading(false);
      },
      (err) => {
        console.error("Firestore payments listener error:", err);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [user]);

  const handlePay = async (orderId: string, amountDue: number) => {
    if (amountDue <= 0) {
      toast.info("אין סכום לתשלום");
      return;
    }

    const toastId = toast.loading("מעבד תשלום...");
    try {
      await updateDoc(doc(db, "orders", orderId), {
        payment_state: "paid",
        paymentState: "paid",
        amount_due: 0,
        amountDue: 0,
      });
      toast.success("התשלום בוצע בהצלחה!", { id: toastId });
    } catch (e) {
      toast.error("שגיאה בביצוע התשלום", { id: toastId });
    }
  };

  return (
    <AppLayout>
      <header className="bg-primary text-primary-foreground rounded-b-[2rem] px-5 pt-safe-payments pb-10 relative">
        <button
          onClick={() => navigate({ to: "/" })}
          className="absolute top-safe-back-btn left-5 size-10 grid place-items-center rounded-full bg-primary-foreground/15"
        >
          <ArrowRight className="size-5" strokeWidth={2} />
        </button>
        <h1 className="text-3xl font-extrabold mt-8">תשלום וחשבוניות</h1>
      </header>

      <main className="px-5 mt-6 space-y-6 pb-20 dir-rtl text-right" dir="rtl">
        {loading && orders.length === 0 ? (
          <div className="py-20 flex justify-center items-center gap-2">
            <Loader2 className="size-6 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">טוען נתוני תשלום...</span>
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-3xl bg-lavender/40 text-lavender-foreground p-8 text-center border border-lavender-foreground/5 shadow-sm">
            <PackageOpen className="size-12 mx-auto mb-3 opacity-60" strokeWidth={1.5} />
            <p className="font-semibold">אין תשלומים פתוחים</p>
            <p className="text-sm opacity-70 mt-1">כל ההזמנות שולמו או שאין הזמנות פעילות</p>
          </div>
        ) : (
          <div className="space-y-8">
            {orders.map((order) => {
              const isPricePending = !order.amount_due || order.amount_due <= 0;

              return (
                <div key={order.id} className="flex flex-col w-full mb-6">
                  {isPricePending ? (
                    // Bottom Order Block (Pending)
                    <div className="border-2 border-border p-5 rounded-[2.5rem] bg-card shadow-sm space-y-4">
                      <div className="bg-slate-50 border border-slate-200 text-slate-700 rounded-3xl p-5 shadow-sm">
                        <div className="flex justify-between items-center text-xs opacity-80 mb-3 font-bold border-b border-current/20 pb-2">
                          <span>הזמנה #{order.id.split("-")[0]}</span>
                          <span>{new Date(order.created_at).toLocaleDateString("he-IL")}</span>
                        </div>
                        <p className="text-sm font-semibold opacity-70">
                          ממתין לעדכון סכום מהמכבסה
                        </p>
                        <p className="text-4xl font-extrabold mt-1">₪0.00</p>
                      </div>

                      <div className="bg-lavender/30 border border-lavender-foreground/10 rounded-3xl p-6 text-center space-y-4 animate-pulse">
                        <div className="size-14 bg-lavender/80 rounded-full grid place-items-center mx-auto shadow-sm">
                          <Sparkles className="size-7 text-primary animate-spin duration-3000" />
                        </div>
                        <div className="space-y-1">
                          <h3 className="text-sm font-extrabold text-foreground">
                            המכבסה מעדכנת את סכום ההזמנה
                          </h3>
                          <p className="text-[11px] text-muted-foreground leading-relaxed px-4">
                            אפשרות התשלום תפתח בקרוב ברגע שצוות המכבסה יסיים לשקול ולתמחר את הכביסה
                            שלך.
                          </p>
                        </div>
                        <div className="flex items-center justify-center gap-1.5 text-[9px] font-black text-primary bg-primary/10 py-1.5 px-3 rounded-full w-fit mx-auto">
                          <span className="size-1.5 bg-primary rounded-full animate-ping" />
                          <span>בודק סטטוס תמחור בזמן אמת...</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    // Top Order Block (Payable)
                    <div className="border-2 border-primary/20 p-5 rounded-[2.5rem] bg-card shadow-sm space-y-4">
                      <div className="bg-lime text-lime-foreground border border-lime/20 shadow-[0_15px_40px_-15px_oklch(0.92_0.18_125/0.6)] rounded-3xl p-5 animate-fade-in">
                        <div className="flex justify-between items-center text-xs opacity-80 mb-3 font-bold border-b border-current/20 pb-2">
                          <span>הזמנה #{order.id.split("-")[0]}</span>
                          <span>{new Date(order.created_at).toLocaleDateString("he-IL")}</span>
                        </div>
                        <p className="text-sm font-semibold opacity-70">סכום לתשלום</p>
                        <p className="text-4xl font-extrabold mt-1">
                          ₪{order.amount_due.toFixed(2)}
                        </p>
                      </div>

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
                                name={`pm-${order.id}`}
                                className="sr-only"
                                checked={method === id}
                                onChange={() => setMethod(id)}
                              />
                              <Icon className="size-5" strokeWidth={1.75} />
                              <span className="font-semibold flex-1">{label}</span>
                              <span
                                className={`size-4 rounded-full border-2 ${method === id ? "bg-primary-foreground border-primary-foreground" : "border-muted-foreground"}`}
                              />
                            </label>
                          ))}
                        </div>
                      </div>

                      <button
                        onClick={() => handlePay(order.id, order.amount_due)}
                        className="w-full rounded-3xl bg-primary text-primary-foreground py-5 text-lg font-extrabold shadow-[0_15px_40px_-15px_oklch(0.34_0.13_333/0.6)] active:scale-[0.98] transition animate-fade-in"
                      >
                        בצע תשלום
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="rounded-3xl bg-lavender text-lavender-foreground p-5 shadow-sm border border-lavender-foreground/5">
          <h3 className="font-bold mb-3 flex items-center gap-2">
            <FileText className="size-5" />
            תיקיית חשבוניות
          </h3>
          {invoices.length === 0 ? (
            <p className="text-sm opacity-70 text-center py-4 font-semibold">אין חשבוניות עדיין</p>
          ) : (
            <ul className="space-y-2">
              {invoices.map((inv: any, idx) => (
                <li key={idx}>
                  <button
                    onClick={() => {
                      if (inv.data) {
                        const link = document.createElement("a");
                        link.href = inv.data;
                        link.download = inv.name || `invoice_${inv.id}.pdf`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        toast.success(`מוריד חשבונית: ${inv.name || inv.id}`);
                      } else {
                        toast.error("קובץ החשבונית לא תקין או חסר.");
                      }
                    }}
                    className="w-full flex items-center justify-between bg-background/60 hover:bg-background/80 transition rounded-2xl px-4 py-3 text-sm shadow-sm"
                  >
                    <span className="flex items-center gap-2 font-semibold truncate pr-2">
                      <FileText className="size-4 shrink-0 text-primary" strokeWidth={2} />
                      <span className="truncate">{inv.name || `חשבונית להזמנה ${inv.id}`}</span>
                    </span>
                    <span className="flex items-center gap-3 shrink-0 pl-1">
                      <span className="text-[10px] text-muted-foreground font-bold">
                        {new Date(inv.date).toLocaleDateString("he-IL")}
                      </span>
                      <Download className="size-4 text-primary opacity-80" strokeWidth={2} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </AppLayout>
  );
}
