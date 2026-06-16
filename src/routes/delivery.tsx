import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppLayout } from "@/components/AppLayout";
import { AppHeader } from "@/components/AppHeader";
import { useLaundry } from "@/lib/laundry-store";
import { Store, Truck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/delivery")({ component: Delivery });

function Delivery() {
  const { setDelivery } = useLaundry();
  const navigate = useNavigate();

  const choose = (m: "self_pickup" | "home_delivery") => {
    setDelivery(m);
    toast.success(m === "self_pickup" ? "נבחר: איסוף עצמי" : "נבחר: משלוח הביתה");
    navigate({ to: "/payments" });
  };

  return (
    <AppLayout>
      <AppHeader subtitle="איך תרצה לקבל את הכביסה?" />
      <main className="px-5 mt-6 space-y-4">
        <button
          onClick={() => choose("self_pickup")}
          className="w-full rounded-3xl bg-lavender text-lavender-foreground p-6 text-right active:scale-[0.98] transition shadow-sm"
        >
          <Store className="size-10" strokeWidth={1.5} />
          <h3 className="mt-4 text-xl font-extrabold">איסוף עצמי</h3>
          <p className="text-sm opacity-75 mt-1">איסוף מהחנות</p>
        </button>
        <button
          onClick={() => choose("home_delivery")}
          className="w-full rounded-3xl bg-lime text-lime-foreground p-6 text-right active:scale-[0.98] transition shadow-sm"
        >
          <Truck className="size-10" strokeWidth={1.5} />
          <h3 className="mt-4 text-xl font-extrabold">משלוח הביתה</h3>
          <p className="text-sm opacity-75 mt-1">עד פתח הדלת</p>
        </button>
      </main>
    </AppLayout>
  );
}
