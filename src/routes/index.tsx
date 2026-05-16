import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLaundry } from "@/lib/laundry-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ShoppingBasket, History, Truck, Package, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { state, createOrder } = useLaundry();
  const navigate = useNavigate();

  if (!state.activeOrder) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] p-6 text-center">
        <div className="mb-8 p-6 bg-secondary rounded-full">
          <ShoppingBasket className="w-16 h-16 text-primary" />
        </div>
        <h1 className="text-2xl font-bold mb-2">שלום, מיקי</h1>
        <p className="text-muted-foreground mb-8">אין לך הזמנות פעילות כרגע</p>
        
        <Button 
          size="lg" 
          className="w-full h-20 text-lg rounded-3xl bg-lime-500 hover:bg-lime-600 text-lime-foreground font-bold shadow-lg"
          onClick={() => createOrder()}
        >
          הזמן איסוף כביסה
        </Button>

        <Button 
          variant="outline" 
          className="w-full mt-4 h-14 rounded-3xl border-lavender bg-lavender/20"
          onClick={() => navigate({ to: "/history" })}
        >
          ההזמנות שלי / היסטוריה
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold">סטטוס הזמנה נוכחי</h2>
      
      <Card className="bg-lime-500 text-lime-foreground border-none shadow-md">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-6">
            <span className="font-bold text-lg">בטיפול</span>
            <Package className="w-8 h-8" />
          </div>
          
          <div className="relative flex justify-between items-center mt-8">
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-lime-700/30 -z-0" />
            {[1, 2, 3, 4].map((step) => (
              <div key={step} className="relative z-10 w-8 h-8 rounded-full bg-lime-700 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            ))}
          </div>
          
          <p className="mt-6 text-sm font-medium opacity-90">זמן מוכנות משוער: 14:30</p>
        </CardContent>
      </Card>

      <Button 
        variant="secondary" 
        className="w-full h-14 rounded-3xl bg-lavender text-lavender-foreground"
        onClick={() => navigate({ to: "/order-details" })}
      >
        פרטי הזמנה מלאים
      </Button>
    </div>
  );
}
