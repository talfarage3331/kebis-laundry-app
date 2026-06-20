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
  role: "admin" | "laundry" | "customer";
  isRoleLoading: boolean;
  login: (u: User) => void;
  logout: () => void;

  /** The laundry vendor UID resolved from the active shop slug (persisted in localStorage) */
  activeTenantId: string | null;
  /** Display name of the active tenant */
  activeTenantName: string | null;
  /** URL slug of the active tenant */
  activeTenantSlug: string | null;
  /** Call this to clear the active tenant (e.g., when user navigates away from a shop link) */
  clearActiveTenant: () => void;

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
  requiresWashing: boolean;

  createOrder: (
    notes?: string,
    images?: string[],
    requiresIroning?: boolean,
    requiresDryCleaning?: boolean,
    deliveryMethod?: DeliveryMethod,
    addons?: string[],
    deliveryTier?: string,
    basePrice?: number,
    totalPrice?: number,
    requiresWashing?: boolean,
    laundryId?: string,
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

/** Full 5-step lifecycle for Home Delivery orders */
export const HOME_DELIVERY_STEPS: { key: OrderState; label: string }[] = [
  { key: "pending",   label: "ממתין" },
  { key: "accepted",  label: "התקבל" },
  { key: "collected", label: "נאסף" },
  { key: "ready",     label: "מוכן" },
  { key: "delivered", label: "נמסר" },
];

/** Shortened 4-step lifecycle for Self-Pickup orders (ends at ready) */
export const SELF_PICKUP_STEPS: { key: OrderState; label: string }[] = [
  { key: "pending",   label: "ממתין" },
  { key: "accepted",  label: "התקבל" },
  { key: "collected", label: "נאסף" },
  { key: "ready",     label: "מוכן" },
];

/**
 * Returns the correct step array based on the order's delivery method.
 * Falls back to HOME_DELIVERY_STEPS for any unknown value.
 */
export function getOrderSteps(deliveryMethod: string) {
  return deliveryMethod === "self_pickup" ? SELF_PICKUP_STEPS : HOME_DELIVERY_STEPS;
}

/** @deprecated Use HOME_DELIVERY_STEPS / SELF_PICKUP_STEPS via getOrderSteps() */
export const ORDER_STEPS = HOME_DELIVERY_STEPS;

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
  const [role, setRole] = useState<"admin" | "laundry" | "customer">("customer");
  const [isRoleLoading, setIsRoleLoading] = useState(true);
  const [orderState, setOrderState] = useState<OrderState>("none");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("none");
  const [paymentState, setPaymentState] = useState<PaymentState>("unpaid");
  const [amountDue, setAmountDue] = useState(0);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [activeOrderDate, setActiveOrderDate] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [requiresIroning, setRequiresIroning] = useState(false);
  const [requiresDryCleaning, setRequiresDryCleaning] = useState(false);
  const [requiresWashing, setRequiresWashing] = useState(false);
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

  // ── Multi-tenant state ────────────────────────────────────────────
  const [activeTenantId, setActiveTenantId] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem("activeLaundryId") : null,
  );
  const [activeTenantName, setActiveTenantName] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem("activeLaundryName") : null,
  );
  const [activeTenantSlug, setActiveTenantSlug] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem("activeLaundrySlug") : null,
  );

  // Listen for localStorage changes triggered by ShopSlugResolver (cross-tab or same-tab via StorageEvent)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "activeLaundryId") {
        setActiveTenantId(e.newValue);
      }
      if (e.key === "activeLaundryName") {
        setActiveTenantName(e.newValue);
      }
      if (e.key === "activeLaundrySlug") {
        setActiveTenantSlug(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const clearActiveTenant = useCallback(() => {
    localStorage.removeItem("activeLaundryId");
    localStorage.removeItem("activeLaundryName");
    localStorage.removeItem("activeLaundrySlug");
    setActiveTenantId(null);
    setActiveTenantName(null);
    setActiveTenantSlug(null);
  }, []);

  // Auth listener — real-time role sync using onSnapshot with robust error callbacks and defaulting
  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (sessionUser) => {
      // Cleanup any existing snapshot listener
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }

      if (sessionUser && sessionUser.email) {
        const email: string = sessionUser.email;
        const uid: string = sessionUser.uid;
        const defaultName: string = sessionUser.displayName || email.split("@")[0] || "משתמש";

        setIsRoleLoading(true);
        setIsProfileReady(false);
        setLoading(true);

        const userDocRef = doc(db, "users", uid);

        unsubscribeSnapshot = onSnapshot(
          userDocRef,
          (userDocSnap) => {
            let userRole: "admin" | "laundry" | "customer" = "customer";
            let dbName = defaultName;

            if (email === "talfarage3331@gmail.com") {
              userRole = "admin";
            }

            if (userDocSnap.exists()) {
              const data = userDocSnap.data();
              dbName = data.fullName || data.name || dbName;
              userRole = data.role || userRole;
            } else {
              // Create user profile document in background
              setDoc(
                userDocRef,
                {
                  fullName: dbName,
                  email: email,
                  role: userRole,
                  createdAt: serverTimestamp(),
                },
                { merge: true }
              ).catch((err) => {
                console.error("Error creating user profile in background:", err);
              });
            }

            // Apply overrides
            const storedOverride = localStorage.getItem(`role_override_${email}`);
            if (storedOverride) {
              userRole = storedOverride as any;
            }
            const storedName = localStorage.getItem(`name_override_${email}`);
            const resolvedDisplayName = storedName || dbName;

            setRole(userRole);
            setUser({
              uid: uid,
              name: resolvedDisplayName,
              email: email,
              role: userRole,
            });
            setIsRoleLoading(false);
            setIsProfileReady(true);
            setLoading(false);
          },
          (error) => {
            console.error("Firestore onSnapshot error for user profile:", error);
            // Defensive defaulting: fallback to customer on error
            let fallbackRole: "admin" | "laundry" | "customer" = "customer";
            if (email === "talfarage3331@gmail.com") {
              fallbackRole = "admin";
            }

            const storedOverride = localStorage.getItem(`role_override_${email}`);
            if (storedOverride) {
              fallbackRole = storedOverride as any;
            }

            const dbName = defaultName;
            const storedName = localStorage.getItem(`name_override_${email}`);
            const resolvedDisplayName = storedName || dbName;

            setRole(fallbackRole);
            setUser({
              uid: uid,
              name: resolvedDisplayName,
              email: email,
              role: fallbackRole,
            });
            setIsRoleLoading(false);
            setIsProfileReady(true);
            setLoading(false);
          }
        );
      } else {
        setUser(null);
        setRole("customer");
        setLoading(false);
        setIsRoleLoading(false);
        setIsProfileReady(true);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
      }
    };
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
          requires_washing: !!(data.requires_washing || data.requiresWashing),
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
        setRequiresWashing(activeOrder.requires_washing || false);
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

  const login = useCallback((u: User) => {
    setUser(u);
    if (u.role) setRole(u.role);
    setIsRoleLoading(false);
  }, []);
  const logout = useCallback(async () => {
    await signOut(auth);
    setUser(null);
    setRole("customer");
    setIsRoleLoading(false);
    setOrderState("none");
    setDeliveryMethod("none");
    setPaymentState("unpaid");
    setAmountDue(0);
    setActiveOrderId(null);
    setActiveOrderDate(null);
    setInvoices([]);
    setRequiresIroning(false);
    setRequiresDryCleaning(false);
    setRequiresWashing(false);
  }, []);

  const createOrder = useCallback(
    async (
      notes?: string,
      images?: string[],
      ironing: boolean = false,
      dryCleaning: boolean = false,
      delivery: DeliveryMethod = "none",
      addons?: string[],
      deliveryTier?: string,
      basePrice?: number,
      totalPrice?: number,
      washing: boolean = false,
      laundryId?: string,
    ): Promise<string | null> => {
      // Auto-resolve tenant from context if caller didn't supply one
      const resolvedLaundryId = laundryId || activeTenantId || "";
      if (!user) return null;
      const newState: OrderState = "pending";
      const amount = 0;

      setOrderState(newState);
      setDeliveryMethod(delivery);
      setPaymentState("unpaid");
      setAmountDue(amount);
      setRequiresIroning(ironing);
      setRequiresDryCleaning(dryCleaning);
      setRequiresWashing(washing);

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
          delivery_method: delivery,
          deliveryMethod: delivery,
          payment_state: "unpaid",
          paymentState: "unpaid",
          amount_due: totalPrice || amount,
          total_price: totalPrice || amount,
          user_email: user.email,
          userEmail: user.email,
          requires_ironing: ironing,
          requiresIroning: ironing,
          requires_dry_cleaning: dryCleaning,
          requiresDryCleaning: dryCleaning,
          requires_washing: washing,
          requiresWashing: washing,
          notes: notes || "",
          images: images || [],
          invoiceUrl: "",
          invoiceName: "",
          created_at: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          addons: addons || [],
          deliveryTier: deliveryTier || "standard",
          basePrice: basePrice || 0,
          laundryId: resolvedLaundryId,
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
    [user, activeTenantId],
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
    setRequiresWashing(false);
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
        role,
        isRoleLoading,
        login,
        logout,
        activeTenantId,
        activeTenantName,
        activeTenantSlug,
        clearActiveTenant,
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
        requiresWashing,
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

export interface AddonItem {
  label: string;
  price: number;
  group: string;
  desc: string;
}

export interface DeliveryTierItem {
  label: string;
  price: number;
  desc: string;
}

export const ADDONS_META: Record<string, AddonItem> = {
  // Group A
  extra_scent: { label: "אקסטרה ריח", price: 10, group: "שדרוגי פרימיום", desc: "מרכך מרוכז או פניני ריח במודל מלונות יוקרה" },
  hypoallergenic: { label: "כביסה היפואלרגנית / לתינוקות", price: 15, group: "שדרוגי פרימיום", desc: "חומרי כביסה ללא ריח וצבע, מאושרים לעור רגיש" },
  eco_friendly: { label: "חומרים ירוקים Eco-Friendly", price: 12, group: "שדרוגי פרימיום", desc: "חומרי ניקוי אקולוגיים המתפרקים ביולוגית" },
  // Group B
  delicate_wash: { label: "כביסה עדינה Delicate Wash", price: 15, group: "סוגי טיפול מיוחדים", desc: "רשתות הגנה, תוכנית קרה וסחיטה איטית" },
  anti_crease: { label: "טיפול מונע קמטים", price: 10, group: "סוגי טיפול מיוחדים", desc: "תוכנית ייבוש מיוחדת או קיפול מיידי מהמייבש" },
  stain_removal: { label: "הסרת כתמים קשים", price: 20, group: "סוגי טיפול מיוחדים", desc: "טיפול ידני מקדים (Pre-treatment) עם מסירי כתמים" },
  // Group D
  contactless: { label: "משלוח שקט (Contactless)", price: 0, group: "חוויית לוגיסטיקה", desc: "השאר מחוץ לדלת - השליח יצלם לאפליקציה" },
  phone_coord: { label: "תיאום טלפוני חובה", price: 0, group: "חוויית לוגיסטיקה", desc: "השליח לא מגיע בלי לוודא בשיחה מקדימה שאתם בבית" },
  // Group E - Self-Pickup Upgrades
  quick_pickup: { label: "איסוף מהיר", price: 10, group: "שירותי איסוף עצמי", desc: "איסוף מיידי מהסניף ללא המתנה בתור" },
  express_wash: { label: "כביסה מהירה", price: 20, group: "שירותי איסוף עצמי", desc: "הכביסה שלך תהיה מוכנה בסניף תוך 4 שעות" }
};

export const DELIVERY_TIERS_META: Record<string, DeliveryTierItem> = {
  standard: { label: "משלוח רגיל (Standard)", price: 0, desc: "איסוף והחזרה תוך 48 שעות" },
  express: { label: "משלוח אקספרס (Express)", price: 35, desc: "איסוף והחזרה תוך 24 שעות" },
  super_express: { label: "משלוח סופר-אקספרס מהיום להיום", price: 60, desc: "איסוף בבוקר, החזרה בערב" }
};
