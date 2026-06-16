import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { auth, db } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  deleteDoc,
  getDocs,
} from "firebase/firestore";

export type OrderState =
  | "none"
  | "pending"
  | "accepted"
  | "collected"
  | "ready"
  | "delivered"
  | "cancelled";
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
  uid: string;
  name: string;
  email: string;
  role?: "admin" | "laundry" | "customer";
}

interface Store {
  user: User | null;
  loading: boolean;
  /** True only after Firebase Auth AND the Firestore role look-up have both settled. */
  isProfileReady: boolean;
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

  createOrder: (
    notes?: string,
    images?: string[],
    requiresIroning?: boolean,
    requiresDryCleaning?: boolean,
    deliveryMethod?: DeliveryMethod,
  ) => Promise<string | null>;
  advanceOrder: () => void;
  setDelivery: (m: DeliveryMethod) => void;
  payAndInvoice: () => void;
  cancelOrder: (orderId: string) => Promise<boolean>;
  reset: () => void;
  refreshActiveOrder: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

/**
 * Normalizes legacy/raw Firestore status strings to the canonical OrderState.
 * Old workflow used: picked_up, in_progress, completed. Migrate at read time.
 */
export function normalizeStatus(raw: any): OrderState {
  const s = String(raw ?? "").trim();
  switch (s) {
    case "pending":
      return "pending";
    case "accepted":
      return "accepted";
    case "picked_up":
    case "in_progress":
    case "collected":
      return "collected";
    case "ready":
      return "ready";
    case "completed":
    case "delivered":
      return "delivered";
    case "cancelled":
    case "canceled":
      return "cancelled";
    default:
      return "pending";
  }
}

export const ORDER_STEPS: { key: OrderState; label: string }[] = [
  { key: "pending", label: "ממתין" },
  { key: "accepted", label: "התקבל" },
  { key: "collected", label: "נאסף" },
  { key: "ready", label: "מוכן" },
  { key: "delivered", label: "נמסר" },
];

export const stateLabel: Record<OrderState, string> = {
  none: "אין הזמנה פעילה",
  pending: "ממתין",
  accepted: "התקבל",
  collected: "נאסף",
  ready: "מוכן",
  delivered: "נמסר",
  cancelled: "בוטלה",
};

export function LaundryProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // isProfileReady stays false until the Firestore role fetch completes (prevents role flash)
  const [isProfileReady, setIsProfileReady] = useState(false);
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

  // Auth listener — setIsProfileReady(true) only after Firestore role resolves
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (sessionUser) => {
      // Mark profile as NOT ready at the start of every auth-state change
      setIsProfileReady(false);

      if (sessionUser && sessionUser.email) {
        setLoading(true);
        let role: "admin" | "laundry" | "customer" = "customer";
        let dbName = sessionUser.displayName || sessionUser.email.split("@")[0] || "משתמש";

        if (sessionUser.email === "talfarage3331@gmail.com") {
          role = "admin";
        }

        try {
          const userDocRef = doc(db, "users", sessionUser.uid);
          const userDocSnap = await getDoc(userDocRef);

          if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            dbName = data.fullName || data.name || dbName;
            role = data.role || role;
          } else {
            // Document doesn't exist, create it
            await setDoc(
              userDocRef,
              {
                fullName: dbName,
                email: sessionUser.email,
                role: role,
                createdAt: serverTimestamp(),
              },
              { merge: true },
            );
          }
        } catch (err) {
          console.error("Error checking or creating user profile:", err);
        }

        // Apply local storage overrides if present (e.g. set by admin for testing)
        const storedOverride = localStorage.getItem(`role_override_${sessionUser.email}`);
        if (storedOverride) {
          role = storedOverride as any;
        }
        const storedName = localStorage.getItem(`name_override_${sessionUser.email}`);
        const displayName = storedName || dbName;

        setUser({
          uid: sessionUser.uid,
          name: displayName,
          email: sessionUser.email,
          role,
        });
        // Both auth + Firestore are resolved — safe to render role-dependent UI
        setLoading(false);
        setIsProfileReady(true);
      } else {
        setUser(null);
        setLoading(false);
        setIsProfileReady(true); // No session — profile trivially resolved
      }
    });

    return () => unsubscribe();
  }, []);

  // Fetch or listen to active order and invoices
  const refreshActiveOrder = useCallback(async () => {
    if (!user) return;
    try {
      // Handled automatically in the onSnapshot listener below, but here we can force a manual read if needed
    } catch (err) {
      console.error("Error refreshing active order:", err);
    }
  }, [user]);

  // Set up real-time listener for current user's orders and invoices
  useEffect(() => {
    if (!user) {
      setOrderState("none");
      setActiveOrderId(null);
      setActiveOrderDate(null);
      setInvoices([]);
      return;
    }

    const q = query(collection(db, "orders"), where("user_email", "==", user.email));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allOrders = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          delivery_method: data.delivery_method || data.deliveryMethod || "none",
          payment_state: data.payment_state || data.paymentState || "unpaid",
          amount_due:
            data.amount_due !== undefined
              ? data.amount_due
              : data.amountDue !== undefined
                ? data.amountDue
                : 0,
          notes: data.notes || "",
          images: data.images || [],
          requires_ironing: !!(data.requires_ironing || data.requiresIroning),
          requires_dry_cleaning: !!(data.requires_dry_cleaning || data.requiresDryCleaning),
          created_at: data.created_at || data.createdAt || new Date().toISOString(),
        } as any;
      });

      // Client-side sort desc to ensure index is not required
      allOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      // Filter out placeholders
      const activeOrder = allOrders.find(
        (o) => o.delivery_method !== "placeholder" && !o.id.startsWith("placeholder"),
      );

      // Invoices - derived from order's invoiceUrl field
      const userInvoices: Invoice[] = allOrders
        .filter((o) => o.invoiceUrl)
        .map((o) => ({
          id: `inv-${o.id}`,
          amount: o.amount_due || 0,
          date: o.created_at,
          name: o.invoiceName || "invoice.pdf",
          data: o.invoiceUrl,
        }));
      setInvoices(userInvoices);

      if (activeOrder) {
        setOrderState(normalizeStatus(activeOrder.status));
        setDeliveryMethod(activeOrder.delivery_method as DeliveryMethod);
        setPaymentState(activeOrder.payment_state as PaymentState);
        setAmountDue(activeOrder.amount_due);
        setActiveOrderId(activeOrder.id);
        setActiveOrderDate(activeOrder.created_at);
        setRequiresIroning(activeOrder.requires_ironing);
        setRequiresDryCleaning(activeOrder.requires_dry_cleaning);
        setOrderNotes(activeOrder.notes);
        setOrderImages(activeOrder.images);
      } else {
        setOrderState("none");
        setActiveOrderId(null);
        setActiveOrderDate(null);
      }
    });

    return () => unsubscribe();
  }, [user]);

  const login = useCallback((u: User) => setUser(u), []);
  const logout = useCallback(async () => {
    await signOut(auth);
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

  const createOrder = useCallback(
    async (
      notes?: string,
      images?: string[],
      ironing: boolean = false,
      dryCleaning: boolean = false,
      delivery: DeliveryMethod = "none",
    ): Promise<string | null> => {
      if (!user) return null;
      const newState: OrderState = "pending";
      const amount = 0;

      setOrderState(newState);
      setDeliveryMethod(delivery);
      setPaymentState("unpaid");
      setAmountDue(amount);
      setRequiresIroning(ironing);
      setRequiresDryCleaning(dryCleaning);

      localStorage.setItem(`laundry_ironing_${user.email}`, String(ironing));
      localStorage.setItem(`laundry_dry_cleaning_${user.email}`, String(dryCleaning));
      localStorage.setItem("laundry_ironing", String(ironing));
      localStorage.setItem("laundry_dry_cleaning", String(dryCleaning));

      if (notes) {
        setOrderNotes(notes);
        localStorage.setItem("laundry_notes", notes);
        localStorage.setItem(`laundry_notes_${user.email}`, notes);
      } else {
        setOrderNotes(null);
        localStorage.removeItem("laundry_notes");
        localStorage.removeItem(`laundry_notes_${user.email}`);
      }

      if (images && images.length > 0) {
        setOrderImages(images);
        localStorage.setItem("laundry_images", JSON.stringify(images));
        localStorage.setItem(`laundry_images_${user.email}`, JSON.stringify(images));
      } else {
        setOrderImages([]);
        localStorage.removeItem("laundry_images");
        localStorage.removeItem(`laundry_images_${user.email}`);
      }

      try {
        // Delete any existing placeholder orders for this user email
        const q = query(
          collection(db, "orders"),
          where("user_email", "==", user.email),
          where("delivery_method", "==", "placeholder"),
        );
        const placeholderSnaps = await getDocs(q);
        const deletePromises = placeholderSnaps.docs.map((d) => deleteDoc(d.ref));
        await Promise.all(deletePromises);

        // Create new order doc in Firestore
        const docRef = await addDoc(collection(db, "orders"), {
          user_id: auth.currentUser?.uid || "",
          userId: auth.currentUser?.uid || "",
          status: newState,
          delivery_method: "none",
          deliveryMethod: "none",
          payment_state: "unpaid",
          paymentState: "unpaid",
          amount_due: amount,
          total_price: amount,
          user_email: user.email,
          userEmail: user.email,
          requires_ironing: ironing,
          requiresIroning: ironing,
          requires_dry_cleaning: dryCleaning,
          requiresDryCleaning: dryCleaning,
          notes: notes || "",
          images: images || [],
          invoiceUrl: "",
          invoiceName: "",
          created_at: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        });

        // Synchronize laundry notifications list locally (Mock triggers)
        const newNotification = {
          id: docRef.id,
          user_email: user.email || "לקוח",
          notes: notes || "כביסה רגילה",
          images: images || [],
          timestamp: new Date().toLocaleTimeString("he-IL"),
        };

        const existingNotifications = JSON.parse(
          localStorage.getItem("laundry_notifications") || "[]",
        );
        localStorage.setItem(
          "laundry_notifications",
          JSON.stringify([newNotification, ...existingNotifications]),
        );

        window.dispatchEvent(new CustomEvent("laundry-order-updated"));
        return docRef.id;
      } catch (err) {
        console.error("Order creation failed in Firestore:", err);
        return null;
      }
    },
    [user],
  );

  const advanceOrder = useCallback(async () => {
    if (!activeOrderId) return;
    let finalState: OrderState = orderState;
    const steps: OrderState[] = ["pending", "accepted", "collected", "ready", "delivered"];
    const i = steps.indexOf(orderState);
    if (i < 0 || i === steps.length - 1) return;
    finalState = steps[i + 1];

    setOrderState(finalState);
    try {
      await updateDoc(doc(db, "orders", activeOrderId), {
        status: finalState,
      });
      window.dispatchEvent(new CustomEvent("laundry-order-updated"));
    } catch (err) {
      console.error("Failed to advance order:", err);
    }
  }, [activeOrderId, orderState]);

  const setDelivery = useCallback(
    async (m: DeliveryMethod) => {
      if (!activeOrderId) return;
      setDeliveryMethod(m);
      try {
        await updateDoc(doc(db, "orders", activeOrderId), {
          delivery_method: m,
          deliveryMethod: m,
        });
        window.dispatchEvent(new CustomEvent("laundry-order-updated"));
      } catch (err) {
        console.error("Failed to set delivery:", err);
      }
    },
    [activeOrderId],
  );

  const payAndInvoice = useCallback(async () => {
    if (!activeOrderId) return;
    setPaymentState("paid");
    setAmountDue(0);
    try {
      await updateDoc(doc(db, "orders", activeOrderId), {
        payment_state: "paid",
        paymentState: "paid",
        amount_due: 0,
      });
      window.dispatchEvent(new CustomEvent("laundry-order-updated"));
    } catch (err) {
      console.error("Failed to pay and invoice:", err);
    }
  }, [activeOrderId]);

  const cancelOrder = useCallback(async (orderId: string): Promise<boolean> => {
    try {
      await updateDoc(doc(db, "orders", orderId), { status: "cancelled" });
      if (orderId === activeOrderId) setOrderState("cancelled");
      window.dispatchEvent(new CustomEvent("laundry-order-updated"));
      return true;
    } catch (err) {
      console.error("Failed to cancel order:", err);
      return false;
    }
  }, [activeOrderId]);

  const reset = useCallback(() => {
    setOrderState("none");
    setDeliveryMethod("none");
    setPaymentState("unpaid");
    setAmountDue(0);
    setActiveOrderId(null);
    setActiveOrderDate(null);
    setInvoices([]);
    setRequiresIroning(false);
    setRequiresDryCleaning(false);
    setOrderNotes(null);
    setOrderImages([]);
    localStorage.removeItem("laundry_notes");
    localStorage.removeItem("laundry_images");
  }, []);

  return (
    <Ctx.Provider
      value={{
        user,
        loading,
        isProfileReady,
        login,
        logout,
        orderState,
        deliveryMethod,
        paymentState,
        amountDue,
        invoices,
        activeOrderId,
        activeOrderDate,
        orderNotes,
        orderImages,
        requiresIroning,
        requiresDryCleaning,
        createOrder,
        advanceOrder,
        setDelivery,
        payAndInvoice,
        cancelOrder,
        reset,
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
