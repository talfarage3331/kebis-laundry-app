import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { supabase } from "./supabase";

export type OrderState = "none" | "pending" | "picked_up" | "in_progress" | "ready" | "completed";
export type DeliveryMethod = "none" | "self_pickup" | "home_delivery";
export type PaymentState = "unpaid" | "paid";

export interface Invoice {
  id: string;
  amount?: number;
  date: string;
  name?: string;
  data?: string;
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
  activeOrderId: string | null;
  activeOrderDate: string | null;
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
  { key: "pending", label: "ממתין לאיסוף" },
  { key: "picked_up", label: "נאסף" },
  { key: "in_progress", label: "בטיפול" },
  { key: "ready", label: "מוכן" },
  { key: "completed", label: "נמסר" },
];

export const stateLabel: Record<OrderState, string> = {
  none: "אין הזמנה פעילה",
  pending: "ההזמנה התקבלה, ממתינים לאיסוף",
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
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [activeOrderDate, setActiveOrderDate] = useState<string | null>(null);
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
      let dbName = "";
      if (sessionUser.email === "talfarage3331@gmail.com") {
        role = "admin";
      }

      try {
        // 1. Process profile sync orders sent by the Admin to update our own profile row (which is allowed by RLS!)
        const { data: syncOrders } = await supabase
          .from("orders")
          .select("*")
          .ilike("user_email", sessionUser.email);

        const syncOrder = (syncOrders || []).find(o => 
          o.delivery_method === "placeholder" || 
          (o.delivery_method || "").startsWith("PROFILE_SYNC:")
        );

        if (syncOrder) {
          const method = syncOrder.delivery_method || "";
          if (method.startsWith("PROFILE_SYNC:")) {
            const parts = method.split(":");
            const newName = parts[1] || "";
            const newRole = parts[2] || "customer";
            const originalMethod = parts[3] || "placeholder";

            if (newName || newRole) {
              await supabase
                .from("profiles")
                .update({
                  full_name: newName,
                  role: newRole
                })
                .eq("id", sessionUser.id);
              
              dbName = newName;
              role = newRole as any;
            }

            // Restore the order's delivery method back to its original state!
            await supabase
              .from("orders")
              .update({
                delivery_method: originalMethod
              })
              .eq("id", syncOrder.id);
          }
        } else if ((syncOrders || []).length === 0) {
          // If no placeholder order exists yet for this customer, let's insert one as a standard pending order!
          await supabase.from("orders").insert([{
            user_email: sessionUser.email,
            status: "pending",
            delivery_method: "placeholder",
            payment_state: "unpaid",
            amount_due: 0,
            total_price: 0
          }]);
        }

        // 2. Fetch standard database profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", sessionUser.id)
          .maybeSingle();

        if (profile) {
          dbName = dbName || profile.full_name || "";
          if (role === "admin" && profile.role !== "admin") {
            // Keep DB role aligned for talfarage3331@gmail.com so stats/labels work correctly
            await supabase
              .from("profiles")
              .update({ role: "admin" })
              .eq("id", sessionUser.id);
          } else {
            role = (role === "admin" ? "admin" : profile.role) as "admin" | "laundry" | "customer";
          }
        }

        // 2.5 Fetch global sync signals from the Admin's profile row (bypasses all RLS blocks!)
        try {
          const { data: adminProf } = await supabase
            .from("profiles")
            .select("avatar_url")
            .eq("email", "talfarage3331@gmail.com")
            .maybeSingle();

          if (adminProf?.avatar_url) {
            const signals = JSON.parse(adminProf.avatar_url);
            const mySignal = signals[sessionUser.email];
            if (mySignal) {
              const newName = mySignal.name || "";
              const newRole = mySignal.role || "customer";

              // If our database profile has a different name, let's update it from our client side!
              if (profile && (profile.full_name !== newName || profile.role !== newRole)) {
                await supabase
                  .from("profiles")
                  .update({
                    full_name: newName,
                    role: newRole
                  })
                  .eq("id", sessionUser.id);
                
                dbName = newName;
                role = newRole as any;
              } else {
                dbName = dbName || newName;
                role = (role === "admin" ? "admin" : newRole) as any;
              }
            }
          }
        } catch (signalsErr) {
          console.error("Error parsing admin sync signals:", signalsErr);
        }

        if (!profile) {
          // Profile not found! Let's insert a default profile record so they show up for the manager!
          const fullName = dbName || sessionUser.user_metadata?.name || sessionUser.email?.split('@')[0] || "משתמש";
          await supabase.from("profiles").insert([{
            id: sessionUser.id,
            full_name: fullName,
            email: sessionUser.email,
            role: role
          }]);
        }
      } catch (err) {
        console.error("Error fetching or syncing user profile:", err);
      }

      // Merge local storage overrides if present (e.g. set by Admin to bypass database RLS limitations)
      const storedOverride = localStorage.getItem(`role_override_${sessionUser.email}`);
      if (storedOverride) {
        role = storedOverride as "admin" | "laundry" | "customer";
      }

      const storedName = localStorage.getItem(`name_override_${sessionUser.email}`);
      const displayName = storedName || dbName || sessionUser.user_metadata?.name || sessionUser.email?.split('@')[0] || "משתמש";

      setUser({
        name: displayName,
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
        setLoading(true);
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
      // 1. Process profile sync orders sent by the Admin in real-time
      const { data: syncOrders } = await supabase
        .from("orders")
        .select("*")
        .ilike("user_email", user.email);

      const syncOrder = (syncOrders || []).find(o => 
        o.delivery_method === "placeholder" || 
        (o.delivery_method || "").startsWith("PROFILE_SYNC:")
      );

      if (syncOrder) {
        let updatedName = "";
        let updatedRole = "";
        
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const method = syncOrder.delivery_method || "";
          if (method.startsWith("PROFILE_SYNC:")) {
            const parts = method.split(":");
            const newName = parts[1] || "";
            const newRole = parts[2] || "customer";
            const originalMethod = parts[3] || "placeholder";

            if (newName || newRole) {
              await supabase
                .from("profiles")
                .update({
                  full_name: newName,
                  role: newRole
                })
                .eq("id", session.user.id);
              
              updatedName = newName;
              updatedRole = newRole;
            }

            // Restore the order's delivery method back to its original state!
            await supabase
              .from("orders")
              .update({
                delivery_method: originalMethod
              })
              .eq("id", syncOrder.id);
          }

          if (updatedName || updatedRole) {
            setUser(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                name: updatedName || prev.name,
                role: (updatedRole as any) || prev.role
              };
            });
            window.dispatchEvent(new Event("storage"));
          }
        }
      } else if ((syncOrders || []).length === 0) {
        // If no placeholder order exists yet for this customer, let's insert one as a standard pending order!
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await supabase.from("orders").insert([{
            user_id: session.user.id, // CRITICAL: RLS requires user_id
            user_email: user.email,
            status: "pending",
            delivery_method: "placeholder",
            payment_state: "unpaid",
            amount_due: 0,
            total_price: 0
          }]);
        }
      }

      // 2. Fetch active order (excluding profile sync placeholders)
      const { data: allOrders, error } = await supabase
        .from('orders')
        .select('*')
        .ilike('user_email', user?.email)
        .order('created_at', { ascending: false });

      if (error) throw error;

      let data = (allOrders || []).find(o => 
        o.delivery_method !== "placeholder" && 
        !(o.delivery_method || "").startsWith("PROFILE_SYNC:")
      );

      // 3. Fetch invoices directly from the new structured SQL invoices table
      const { data: dbInvoices } = await supabase
        .from("invoices")
        .select("*")
        .eq("user_email", user.email)
        .order("created_at", { ascending: false });

      if (dbInvoices) {
        setInvoices(dbInvoices.map((inv: any) => ({
          id: inv.id,
          amount: data?.amount_due || 0,
          date: inv.created_at,
          name: inv.name,
          data: inv.data
        })));
      }

      if (data) {
        const finalStatus = data.status as OrderState;
        const finalAmount = data.amount_due || 0;
        const finalNotes = data.notes || "";
        const finalImages = data.images;

        setOrderState(finalStatus);
        setDeliveryMethod(data.delivery_method as DeliveryMethod);
        setPaymentState(data.payment_state as PaymentState);
        setAmountDue(finalAmount);
        setActiveOrderId(data.id || null);
        setActiveOrderDate(data.created_at || null);

        // Fetch optional services
        setRequiresIroning(!!data.requires_ironing);
        setRequiresDryCleaning(!!data.requires_dry_cleaning);

        setOrderNotes(finalNotes || null);

        let images: string[] = [];
        try {
          if (finalImages) {
            images = typeof finalImages === 'string' ? JSON.parse(finalImages) : finalImages;
          }
        } catch (e) {
          console.error("Error parsing images:", e);
        }
        setOrderImages(images);
      } else {
        setOrderState("none");
        setActiveOrderId(null);
        setActiveOrderDate(null);
      }
    } catch (err) {
      console.error("Error refreshing active order:", err);
    }
  }, [user]);

  // Fetch initial state from Supabase when user is logged in
  useEffect(() => {
    refreshActiveOrder();
    
    // Cross-tab real-time synchronization listener
    const handleStorage = (e: StorageEvent) => {
      // Re-fetch order when laundry dashboard triggers a sync or notifications change
      refreshActiveOrder();
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [user, refreshActiveOrder]);

  // Set up real-time listener for Admin sync signal changes (bypasses RLS database limitations!)
  useEffect(() => {
    if (!user || user.email === "talfarage3331@gmail.com") return;

    const subscription = supabase
      .channel('admin-profile-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `email=eq.talfarage3331@gmail.com`
        },
        (payload: any) => {
          const adminProf = payload.new;
          if (adminProf?.avatar_url) {
            try {
              const signals = JSON.parse(adminProf.avatar_url);
              const mySignal = signals[user.email];
              if (mySignal) {
                const newName = mySignal.name || "";
                const newRole = mySignal.role || "customer";

                setUser(prev => {
                  if (!prev) return prev;
                  // If the name is changing, let's also update the database!
                  if (prev.name !== newName || prev.role !== newRole) {
                    supabase.auth.getSession().then(({ data: { session } }) => {
                      if (session?.user) {
                        supabase
                          .from("profiles")
                          .update({
                            full_name: newName,
                            role: newRole
                          })
                          .eq("id", session.user.id)
                          .then();
                      }
                    });
                  }
                  return {
                    ...prev,
                    name: newName || prev.name,
                    role: (newRole as any) || prev.role
                  };
                });
                window.dispatchEvent(new Event("storage"));
              }
            } catch (err) {
              console.error("Error parsing real-time admin sync signals:", err);
            }
          }
        }
      )
      .subscribe();

    return () => { subscription.unsubscribe(); };
  }, [user]);

  const login = useCallback((u: User) => setUser(u), []);
  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setOrderState("none");
    setDeliveryMethod("none");
    setPaymentState("unpaid");
    setAmountDue(0);
    setActiveOrderId(null);
    setActiveOrderDate(null);
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
    const newState: OrderState = "pending";
    const amount = 0; // Dynamic pricing starts at 0
    
    // Delete any existing placeholder orders for this user before creating a real one
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await supabase
        .from("orders")
        .delete()
        .eq("user_id", session.user.id)
        .eq("delivery_method", "placeholder");
    }

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

    const userId = session?.user?.id;

    // Insert into Supabase with user_id to satisfy RLS policies
    const { data: insertedOrder, error: insertError } = await supabase.from('orders').insert([{
      user_id: userId, // CRITICAL: RLS requires this to match auth.uid()
      status: newState,
      delivery_method: "none",
      payment_state: "unpaid",
      amount_due: amount,
      total_price: amount, // support both columns for database compatibility
      user_email: user?.email,
      requires_ironing: ironing,
      requires_dry_cleaning: dryCleaning
    }]).select();

    if (insertError) {
      console.error("Order insert failed:", insertError);
    }

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

    // Sync active order locally
    await refreshActiveOrder();
  }, [user, refreshActiveOrder]);

  // Realtime listener for current user's orders and invoices to update state
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("store-orders-realtime-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (payload) => {
          const newOrder = payload.new as any;
          const oldOrder = payload.old as any;
          const newEmail = (newOrder?.user_email || "").toLowerCase();
          const oldEmail = (oldOrder?.user_email || "").toLowerCase();
          const userEmail = (user.email || "").toLowerCase();
          if (newEmail === userEmail || oldEmail === userEmail) {
            refreshActiveOrder();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoices" },
        (payload) => {
          const newInvoice = payload.new as any;
          const oldInvoice = payload.old as any;
          const newEmail = (newInvoice?.user_email || "").toLowerCase();
          const oldEmail = (oldInvoice?.user_email || "").toLowerCase();
          const userEmail = (user.email || "").toLowerCase();
          if (newEmail === userEmail || oldEmail === userEmail) {
            refreshActiveOrder();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, refreshActiveOrder]);

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
    setActiveOrderId(null);
    setActiveOrderDate(null);
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
        activeOrderId, activeOrderDate,
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
