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
  role?: "admin" | "laundry" | "customer";
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
  requiresIroning: boolean;
  requiresDryCleaning: boolean;

  createOrder: (notes?: string, images?: string[], requiresIroning?: boolean, requiresDryCleaning?: boolean) => Promise<void>;
  advanceOrder: () => void;
  setDelivery: (m: DeliveryMethod) => void;
  payAndInvoice: () => void;
  reset: () => void;
  refreshActiveOrder: () => Promise<void>;
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
  const [requiresIroning, setRequiresIroning] = useState(false);
  const [requiresDryCleaning, setRequiresDryCleaning] = useState(false);
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
    const fetchAndSetUser = async (sessionUser: any) => {
      let role: "admin" | "laundry" | "customer" = "customer";
      if (sessionUser.email === "talfarage3331@gmail.com") {
        role = "admin";
      } else {
        try {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", sessionUser.id)
            .maybeSingle();
          if (profile?.role) {
            role = profile.role as "admin" | "laundry" | "customer";
          }
        } catch (err) {
          console.error("Error fetching user profile role:", err);
        }
      }
      setUser({
        name: sessionUser.user_metadata?.name || sessionUser.email?.split('@')[0] || "משתמש",
        email: sessionUser.email || "",
        role
      });
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchAndSetUser(session.user).then(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchAndSetUser(session.user).then(() => setLoading(false));
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const refreshActiveOrder = useCallback(async () => {
    if (!user) return;
    try {
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
        setAmountDue(data.amount_due || 0);

        // Fetch optional services with localStorage fallbacks
        const ironing = (data as any).requires_ironing || localStorage.getItem(`laundry_ironing_${user?.email}`) === "true";
        setRequiresIroning(!!ironing);

        const dryCleaning = (data as any).requires_dry_cleaning || localStorage.getItem(`laundry_dry_cleaning_${user?.email}`) === "true";
        setRequiresDryCleaning(!!dryCleaning);

        // Dynamic fallback schema: load notes and images by user email prefix
        const dbNotes = (data as any).notes;
        const dbImages = (data as any).images;

        const notes = dbNotes || localStorage.getItem(`laundry_notes_${user?.email}`) || localStorage.getItem("laundry_notes") || null;
        setOrderNotes(notes);

        let images: string[] = [];
        try {
          if (dbImages) {
            images = typeof dbImages === 'string' ? JSON.parse(dbImages) : dbImages;
          } else {
            images = JSON.parse(localStorage.getItem(`laundry_images_${user?.email}`) || localStorage.getItem("laundry_images") || "[]");
          }
        } catch (e) {
          console.error("Error parsing images:", e);
        }
        setOrderImages(images);
      }
    } catch (err) {
      console.error("Error refreshing active order:", err);
    }
  }, [user]);

  // Fetch initial state from Supabase when user is logged in
  useEffect(() => {
    refreshActiveOrder();
  }, [user, refreshActiveOrder]);

  const login = useCallback((u: User) => setUser(u), []);
  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setOrderState("none");
    setDeliveryMethod("none");
    setPaymentState("unpaid");
    setAmountDue(0);
    setInvoices([]);
    setRequiresIroning(false);
    setRequiresDryCleaning(false);
  }, []);

  const createOrder = useCallback(async (
    notes?: string, 
    images?: string[], 
    ironing: boolean = false, 
    dryCleaning: boolean = false
  ) => {
    const newState: OrderState = "picked_up";
    const amount = 0; // Dynamic pricing starts at 0
    
    setOrderState(newState);
    setDeliveryMethod("none");
    setPaymentState("unpaid");
    setAmountDue(amount);
    setRequiresIroning(ironing);
    setRequiresDryCleaning(dryCleaning);

    localStorage.setItem(`laundry_ironing_${user?.email}`, String(ironing));
    localStorage.setItem(`laundry_dry_cleaning_${user?.email}`, String(dryCleaning));
    localStorage.setItem("laundry_ironing", String(ironing));
    localStorage.setItem("laundry_dry_cleaning", String(dryCleaning));

    if (notes) {
      setOrderNotes(notes);
      localStorage.setItem("laundry_notes", notes);
      localStorage.setItem(`laundry_notes_${user?.email}`, notes);
    } else {
      setOrderNotes(null);
      localStorage.removeItem("laundry_notes");
      localStorage.removeItem(`laundry_notes_${user?.email}`);
    }

    if (images && images.length > 0) {
      setOrderImages(images);
      localStorage.setItem("laundry_images", JSON.stringify(images));
      localStorage.setItem(`laundry_images_${user?.email}`, JSON.stringify(images));
    } else {
      setOrderImages([]);
      localStorage.removeItem("laundry_images");
      localStorage.removeItem(`laundry_images_${user?.email}`);
    }

    // Insert into Supabase with optional requires_ironing and requires_dry_cleaning columns
    const { data: insertedOrder } = await supabase.from('orders').insert([{
      status: newState,
      delivery_method: "none",
      payment_state: "unpaid",
      amount_due: amount,
      total_price: amount, // support both columns for database compatibility
      user_email: user?.email,
      requires_ironing: ironing,
      requires_dry_cleaning: dryCleaning
    }]).select();

    // Trigger a real-time notification for the Laundry staff (running on separate tabs/browsers locally)
    const newNotification = {
      id: insertedOrder?.[0]?.id || String(Math.floor(Math.random() * 100000)),
      user_email: user?.email || "לקוח",
      notes: notes || "כביסה רגילה",
      images: images || [],
      timestamp: new Date().toLocaleTimeString("he-IL")
    };
    
    const existingNotifications = JSON.parse(localStorage.getItem("laundry_notifications") || "[]");
    localStorage.setItem("laundry_notifications", JSON.stringify([newNotification, ...existingNotifications]));
    
    // Dispatch standard storage event to trigger real-time UI reaction
    window.dispatchEvent(new Event("storage"));
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
    setRequiresIroning(false);
    setRequiresDryCleaning(false);
    localStorage.removeItem("laundry_notes");
    localStorage.removeItem("laundry_images");
    localStorage.removeItem("laundry_ironing");
    localStorage.removeItem("laundry_dry_cleaning");
  }, []);

  return (
    <Ctx.Provider
      value={{
        user, loading, login, logout,
        orderState, deliveryMethod, paymentState, amountDue, invoices,
        orderNotes, orderImages, requiresIroning, requiresDryCleaning,
        createOrder, advanceOrder, setDelivery, payAndInvoice, reset,
        refreshActiveOrder,
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
