import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { supabase } from "./supabase";

export type OrderState = "none" | "picked_up" | "in_progress" | "ready" | "completed";
export type DeliveryMethod = "none" | "self_pickup" | "home_delivery";
export type PaymentState = "unpaid" | "paid";

export interface Invoice {
  id: string;
  amount: number;
  date: string;
}

export interface User {
  name: string;
  email: string;
}

interface Store {
  user: User | null;
  loading: boolean;
  login: (u: User) => void;
  logout: () => void;

  orderState: OrderState;
  deliveryMethod: DeliveryMethod;
  paymentState: PaymentState;
  amountDue: number;
  invoices: Invoice[];
  
  orderNotes: string | null;
  orderImages: string[];

  createOrder: (notes?: string, images?: string[]) => Promise<void>;
  advanceOrder: () => void;
  setDelivery: (m: DeliveryMethod) => void;
  payAndInvoice: () => void;
  reset: () => void;
}

const Ctx = createContext<Store | null>(null);

export const ORDER_STEPS: { key: OrderState; label: string }[] = [
  { key: "picked_up", label: "נאסף" },
  { key: "in_progress", label: "בטיפול" },
  { key: "ready", label: "מוכן" },
  { key: "completed", label: "נמסר" },
];

export const stateLabel: Record<OrderState, string> = {
  none: "אין הזמנה פעילה",
  picked_up: "הכביסה נאספה",
  in_progress: "בטיפול / בעיבוד",
  ready: "מוכן",
  completed: "הושלם",
};

export function LaundryProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [orderState, setOrderState] = useState<OrderState>("none");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("none");
  const [paymentState, setPaymentState] = useState<PaymentState>("unpaid");
  const [amountDue, setAmountDue] = useState(0);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [orderNotes, setOrderNotes] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("laundry_notes");
    }
    return null;
  });
  const [orderImages, setOrderImages] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        return JSON.parse(localStorage.getItem("laundry_images") || "[]");
      } catch {
        return [];
      }
    }
    return [];
  });

  // Auth listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({
          name: session.user.user_metadata.name || session.user.email?.split('@')[0] || "משתמש",
          email: session.user.email || ""
        });
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          name: session.user.user_metadata.name || session.user.email?.split('@')[0] || "משתמש",
          email: session.user.email || ""
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch initial state from Supabase when user is logged in
  useEffect(() => {
    if (!user) return;
    
    async function fetchOrder() {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('user_email', user?.email)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data && !error) {
        setOrderState(data.status as OrderState);
        setDeliveryMethod(data.delivery_method as DeliveryMethod);
        setPaymentState(data.payment_state as PaymentState);
        setAmountDue(data.amount_due);
      }
    }
    fetchOrder();
  }, [user]);

  const login = useCallback((u: User) => setUser(u), []);
  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setOrderState("none");
    setDeliveryMethod("none");
    setPaymentState("unpaid");
    setAmountDue(0);
    setInvoices([]);
  }, []);

  const createOrder = useCallback(async (notes?: string, images?: string[]) => {
    const newState: OrderState = "picked_up";
    const amount = 125;
    
    setOrderState(newState);
    setDeliveryMethod("none");
    setPaymentState("unpaid");
    setAmountDue(amount);

    if (notes) {
      setOrderNotes(notes);
      localStorage.setItem("laundry_notes", notes);
    } else {
      setOrderNotes(null);
      localStorage.removeItem("laundry_notes");
    }

    if (images && images.length > 0) {
      setOrderImages(images);
      localStorage.setItem("laundry_images", JSON.stringify(images));
    } else {
      setOrderImages([]);
      localStorage.removeItem("laundry_images");
    }

    await supabase.from('orders').insert([{
      status: newState,
      delivery_method: "none",
      payment_state: "unpaid",
      amount_due: amount,
      user_email: user?.email
    }]);
  }, [user]);

  const advanceOrder = useCallback(async () => {
    let finalState: OrderState = orderState;
    setOrderState((s) => {
      const order: OrderState[] = ["picked_up", "in_progress", "ready", "completed"];
      const i = order.indexOf(s);
      if (i < 0 || i === order.length - 1) return s;
      finalState = order[i + 1];
      return finalState;
    });

    if (finalState !== orderState) {
      // Update most recent order in Supabase
      const { data } = await supabase
        .from('orders')
        .select('id')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (data) {
        await supabase
          .from('orders')
          .update({ status: finalState })
          .eq('id', data.id);
      }
    }
  }, [orderState]);

  const setDelivery = useCallback(async (m: DeliveryMethod) => {
    setDeliveryMethod(m);
    const { data } = await supabase
      .from('orders')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (data) {
      await supabase
        .from('orders')
        .update({ delivery_method: m })
        .eq('id', data.id);
    }
  }, []);

  const payAndInvoice = useCallback(async () => {
    setPaymentState("paid");
    setInvoices((prev) => [
      {
        id: String(10000 + prev.length + Math.floor(Math.random() * 900)),
        amount: amountDue,
        date: new Date().toLocaleDateString("he-IL"),
      },
      ...prev,
    ]);
    
    const { data } = await supabase
      .from('orders')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (data) {
      await supabase
        .from('orders')
        .update({ payment_state: "paid", amount_due: 0 })
        .eq('id', data.id);
    }
    
    setAmountDue(0);
  }, [amountDue]);

  const reset = useCallback(async () => {
    setOrderState("none");
    setDeliveryMethod("none");
    setPaymentState("unpaid");
    setOrderNotes(null);
    setOrderImages([]);
    localStorage.removeItem("laundry_notes");
    localStorage.removeItem("laundry_images");
  }, []);

  return (
    <Ctx.Provider
      value={{
        user, loading, login, logout,
        orderState, deliveryMethod, paymentState, amountDue, invoices,
        orderNotes, orderImages,
        createOrder, advanceOrder, setDelivery, payAndInvoice, reset,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useLaundry() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLaundry must be used within LaundryProvider");
  return c;
}
