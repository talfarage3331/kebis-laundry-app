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

function Payments() {
  const { amountDue, invoices, payAndInvoice, paymentState } = useLaundry();
  const navigate = useNavigate();
  const [method, setMethod] = useState<string>("credit");
  const [whatsapp, setWhatsapp] = useState(true);
  const [email, setEmail] = useState(false);

  const handlePay = () => {
    if (amountDue <= 0) {
      toast.info("אין סכום לתשלום");
      return;
    }
    payAndInvoice();
    toast.success("התשלום בוצע בהצלחה! החשבונית נוצרה.");
  };

  return (
    <AppLayout>
      <header className="bg-primary text-primary-foreground rounded-b-[2rem] px-5 pt-6 pb-10 relative">
        <button onClick={() => navigate({ to: "/" })} className="absolute top-6 left-5 size-10 grid place-items-center rounded-full bg-primary-foreground/15">
          <ArrowRight className="size-5" strokeWidth={2} />
        </button>
        <h1 className="text-3xl font-extrabold mt-8">תשלום וחשבוניות</h1>
      </header>

      <main className="px-5 mt-6 space-y-4 pb-4">
        <div className="rounded-3xl bg-lime text-lime-foreground p-5 shadow-[0_15px_40px_-15px_oklch(0.92_0.18_125/0.6)]">
          <p className="text-sm font-semibold opacity-70">סכום לתשלום</p>
          <p className="text-4xl font-extrabold mt-1">₪{amountDue.toFixed(2)}</p>
          {paymentState === "paid" && <p className="text-xs font-bold mt-2 text-primary">✓ שולם</p>}
        </div>

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

        <div className="rounded-3xl border border-border p-5">
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

        <button
          onClick={handlePay}
          className="w-full rounded-3xl bg-primary text-primary-foreground py-5 text-lg font-extrabold shadow-[0_15px_40px_-15px_oklch(0.34_0.13_333/0.6)] active:scale-[0.98] transition"
        >
          בצע תשלום וקבל חשבונית
        </button>
      </main>
    </AppLayout>
  );
}
