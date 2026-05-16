import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { AppHeader } from "@/components/AppHeader";
import { useLaundry, ORDER_STEPS, stateLabel } from "@/lib/laundry-store";
import { ShoppingBasket, History, ChevronLeft, Check } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const { user, orderState, createOrder } = useLaundry();
  const navigate = useNavigate();

  return (
    <AppLayout>
      <AppHeader subtitle={user ? `שלום, ${user.name}` : undefined} />
      <main className="px-5 mt-6">
        {orderState === "none" ? <EmptyState onCreate={createOrder} /> : <ActiveOrder />}
        <Link
          to="/tracking"
          className="mt-6 flex items-center justify-between rounded-3xl bg-lavender text-lavender-foreground px-5 py-5 font-semibold shadow-sm active:scale-[0.98] transition"
        >
          <span>ההזמנות שלי / היסטוריה</span>
          <ChevronLeft className="size-5" strokeWidth={2} />
        </Link>
        {orderState !== "none" && (
          <button
            onClick={() => navigate({ to: "/delivery" })}
            className="mt-3 w-full rounded-3xl border-2 border-primary text-primary px-5 py-4 font-semibold active:scale-[0.98] transition"
          >
            המשך לבחירת מסירה
          </button>
        )}
      </main>
    </AppLayout>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 pt-4">
      <button
        onClick={onCreate}
        className="relative group size-64 rounded-full bg-lime text-lime-foreground shadow-[0_20px_50px_-12px_oklch(0.92_0.18_125/0.6)] active:scale-95 transition-all duration-300 flex flex-col items-center justify-center gap-3"
      >
        <ShoppingBasket className="size-16" strokeWidth={1.5} />
        <span className="text-xl font-extrabold leading-tight px-6 text-center">
          הזמן איסוף כביסה
        </span>
      </button>
      <p className="text-sm text-muted-foreground mt-1">לחיצה אחת ואנחנו בדרך אליך</p>
    </div>
  );
}

function ActiveOrder() {
  const { orderState, advanceOrder } = useLaundry();
  const currentIdx = ORDER_STEPS.findIndex((s) => s.key === orderState);

  return (
    <div>
      <div className="rounded-3xl bg-lime text-lime-foreground p-5 shadow-[0_20px_50px_-15px_oklch(0.92_0.18_125/0.5)]">
        <p className="text-sm font-semibold opacity-70">סטטוס נוכחי</p>
        <h2 className="text-2xl font-extrabold mt-1">{stateLabel[orderState]}</h2>

        <div className="mt-6 flex items-center justify-between">
          {ORDER_STEPS.map((s, i) => {
            const done = i <= currentIdx;
            return (
              <div key={s.key} className="flex-1 flex flex-col items-center relative">
                {i > 0 && (
                  <div
                    className={`absolute right-1/2 top-3 h-1 w-full ${
                      i <= currentIdx ? "bg-primary" : "bg-lime-foreground/15"
                    }`}
                  />
                )}
                <div
                  className={`relative z-10 size-7 rounded-full grid place-items-center text-xs font-bold ${
                    done ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border-2 border-lime-foreground/20"
                  }`}
                >
                  {done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
                </div>
                <span className="mt-2 text-[11px] font-semibold text-center">{s.label}</span>
              </div>
            );
          })}
        </div>

        {orderState === "in_progress" && (
          <p className="mt-5 text-sm font-semibold bg-primary/10 rounded-2xl px-4 py-2.5">
            זמן מוכנות משוער: 14:30
          </p>
        )}

        <button
          onClick={advanceOrder}
          disabled={orderState === "completed"}
          className="mt-4 w-full rounded-2xl bg-primary text-primary-foreground py-3 text-sm font-semibold disabled:opacity-50"
        >
          {orderState === "completed" ? "ההזמנה הושלמה" : "קדם סטטוס (דמו)"}
        </button>
      </div>
    </div>
  );
}
