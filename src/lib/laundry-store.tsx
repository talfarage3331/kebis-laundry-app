import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

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
  login: (u: User) => void;
  logout: () => void;

  orderState: OrderState;
  deliveryMethod: DeliveryMethod;
  paymentState: PaymentState;
  amountDue: number;
  invoices: Invoice[];

  createOrder: () => void;
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
  const [orderState, setOrderState] = useState<OrderState>("none");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("none");
  const [paymentState, setPaymentState] = useState<PaymentState>("unpaid");
  const [amountDue, setAmountDue] = useState(0);
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  const login = useCallback((u: User) => setUser(u), []);
  const logout = useCallback(() => {
    setUser(null);
    setOrderState("none");
    setDeliveryMethod("none");
    setPaymentState("unpaid");
    setAmountDue(0);
    setInvoices([]);
  }, []);

  const createOrder = useCallback(() => {
    setOrderState("picked_up");
    setDeliveryMethod("none");
    setPaymentState("unpaid");
    setAmountDue(125);
  }, []);

  const advanceOrder = useCallback(() => {
    setOrderState((s) => {
      const order: OrderState[] = ["picked_up", "in_progress", "ready", "completed"];
      const i = order.indexOf(s);
      if (i < 0 || i === order.length - 1) return s;
      return order[i + 1];
    });
  }, []);

  const setDelivery = useCallback((m: DeliveryMethod) => setDeliveryMethod(m), []);

  const payAndInvoice = useCallback(() => {
    setPaymentState("paid");
    setInvoices((prev) => [
      {
        id: String(10000 + prev.length + Math.floor(Math.random() * 900)),
        amount: amountDue,
        date: new Date().toLocaleDateString("he-IL"),
      },
      ...prev,
    ]);
    setAmountDue(0);
  }, [amountDue]);

  const reset = useCallback(() => {
    setOrderState("none");
    setDeliveryMethod("none");
    setPaymentState("unpaid");
  }, []);

  return (
    <Ctx.Provider
      value={{
        user, login, logout,
        orderState, deliveryMethod, paymentState, amountDue, invoices,
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
