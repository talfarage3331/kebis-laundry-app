import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useLaundry } from "@/lib/laundry-store";
import { db } from "@/lib/firebase";
import { AdminPricingPanel } from "@/components/AdminPricingPanel";
import { useLaundryOptions } from "@/hooks/use-laundry-options";
import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  Users,
  UserCheck,
  Shield,
  Trash2,
  Edit2,
  Search,
  LogOut,
  Plus,
  X,
  Check,
  ArrowRight,
  UserPlus,
  Filter,
  MessageSquareText,
  Building2,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  XCircle,
  PlusCircle,
  Tag,
  DollarSign,
  Settings,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  component: AdminDashboard,
});

interface Profile {
  id: string;
  fullName: string;
  email: string;
  role: "admin" | "laundry" | "customer";
  status?: "pending_approval" | "approved" | "suspended";
  businessName?: string;
  shopSlug?: string;
}

interface LaundryOrder {
  id: string;
  created_at: string;
  status: string;
  delivery_method: string;
  payment_state: string;
  amount_due: number;
  price?: number;
  basePrice?: number;
  user_email: string;
  userId: string;
  notes?: string;
  deliveryNotes?: string;
  images?: string[];
  requires_ironing?: boolean;
  requires_dry_cleaning?: boolean;
  requires_washing?: boolean;
  addons?: string[];
  deliveryTier?: string;
  laundryId?: string;
}

function getStatusLabel(status: string) {
  const map: Record<string, string> = {
    pending: "ממתין",
    accepted: "התקבל",
    collected: "נאסף",
    ready: "מוכן",
    delivered: "נמסר",
    cancelled: "בוטלה",
  };
  return map[status] ?? status;
}

function getStatusColor(status: string) {
  const map: Record<string, string> = {
    pending:   "bg-purple-100 text-purple-800 border-purple-200",
    accepted:  "bg-blue-100   text-blue-800   border-blue-200",
    collected: "bg-amber-100  text-amber-800  border-amber-200",
    ready:     "bg-lime/30    text-lime-foreground border-lime/40",
    delivered: "bg-slate-100  text-slate-600  border-slate-200",
    cancelled: "bg-red-100    text-red-700    border-red-200",
  };
  return map[status] ?? "bg-muted text-muted-foreground border-muted-foreground/10";
}

function AdminDashboard() {
  const { user, logout } = useLaundry();
  const { resolveAddon, resolveTier } = useLaundryOptions();
  const navigate = useNavigate();

  // Tab State
  const [activeTab, setActiveTab] = useState<"users" | "laundries" | "orders" | "pricing">("users");

  // User Profiles State
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  // Edit User State
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<"admin" | "laundry" | "customer">("customer");
  const [editStatus, setEditStatus] = useState<"pending_approval" | "approved" | "suspended">("approved");
  const [isUpdating, setIsUpdating] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  // Global Orders State
  const [orders, setOrders] = useState<LaundryOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [orderSearchQuery, setOrderSearchQuery] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");
  const [orderLaundryFilter, setOrderLaundryFilter] = useState("all");
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  // Customized pricing/addon edits on orders
  const [orderPrices, setOrderPrices] = useState<Record<string, number>>({});

  // Edit Laundry Profile Settings CRUD (Selected Laundry Modal)
  const [selectedLaundry, setSelectedLaundry] = useState<Profile | null>(null);
  const [laundryModalTab, setLaundryModalTab] = useState<"details" | "addons" | "tiers">("details");
  
  // Custom Laundry Options Lists
  const [laundryAddons, setLaundryAddons] = useState<any[]>([]);
  const [laundryTiers, setLaundryTiers] = useState<any[]>([]);
  const [laundryAddonsLoading, setLaundryAddonsLoading] = useState(false);
  const [laundryTiersLoading, setLaundryTiersLoading] = useState(false);

  // Laundry Business details form states
  const [editBusinessName, setEditBusinessName] = useState("");
  const [editShopSlug, setEditShopSlug] = useState("");
  const [editFullName, setEditFullName] = useState("");

  // Sub-forms inside Laundry Edit
  const [showAddonForm, setShowAddonForm] = useState(false);
  const [editingAddonId, setEditingAddonId] = useState<string | null>(null);
  const [addonForm, setAddonForm] = useState({ label: "", price: 0, desc: "", group: "שדרוגי פרימיום" });

  const [showTierForm, setShowTierForm] = useState(false);
  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [tierForm, setTierForm] = useState({ label: "", price: 0, desc: "" });

  const [isSeeding, setIsSeeding] = useState(false);

  // Fetch unread chat messages count for admin (real-time via onSnapshot)
  useEffect(() => {
    if (!user?.email) return;

    const messagesGroup = collectionGroup(db, "messages");
    const unsubscribe = onSnapshot(messagesGroup, (snapshot) => {
      try {
        const count = snapshot.docs.filter(
          (d) => d.data().is_read === false && d.data().sender_email !== user.email,
        ).length;
        setUnreadChatCount(count);
      } catch (err) {
        console.error("Error fetching unread chat count:", err);
      }
    });

    return () => unsubscribe();
  }, [user?.email]);

  // Fetch Profiles
  const fetchProfiles = async () => {
    setIsLoading(true);
    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, orderBy("email", "asc"));
      const snapshot = await getDocs(q);

      const data: Profile[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        fullName: docSnap.data().fullName || "",
        email: docSnap.data().email || "",
        role: docSnap.data().role || "customer",
        status: docSnap.data().status,
        businessName: docSnap.data().businessName || "",
        shopSlug: docSnap.data().shopSlug || docSnap.data().slug || "",
      }));

      setProfiles(data);
    } catch (err: any) {
      toast.error("שגיאה בטעינת משתמשים: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  // Listen to ALL orders in real-time
  useEffect(() => {
    setOrdersLoading(true);
    const unsub = onSnapshot(collection(db, "orders"), (snap) => {
      const list = snap.docs.map(docSnap => {
        const data = docSnap.data();
        let parsedImages: string[] = [];
        if (Array.isArray(data.images)) {
          parsedImages = data.images.filter((img: any) => typeof img === "string");
        } else if (typeof data.images === "string" && data.images) {
          try {
            const parsed = JSON.parse(data.images);
            parsedImages = Array.isArray(parsed) ? parsed : [];
          } catch {
            parsedImages = [];
          }
        }

        return {
          id: docSnap.id,
          created_at: data.created_at || data.createdAt || new Date().toISOString(),
          status: data.status || "pending",
          delivery_method: data.delivery_method || data.deliveryMethod || "none",
          payment_state: data.payment_state || data.paymentState || "unpaid",
          amount_due: Number(data.price ?? data.amount_due ?? data.amountDue ?? 0) || 0,
          price: Number(data.price ?? data.amount_due ?? data.amountDue ?? 0) || 0,
          basePrice: data.basePrice !== undefined ? Number(data.basePrice) : undefined,
          user_email: data.user_email || data.userEmail || "",
          userId: data.user_id || data.userId || "",
          notes: data.notes || "",
          deliveryNotes: data.deliveryNotes || data.delivery_notes || "",
          images: parsedImages,
          requires_ironing: !!(data.requires_ironing || data.requiresIroning),
          requires_dry_cleaning: !!(data.requires_dry_cleaning || data.requiresDryCleaning),
          requires_washing: !!(data.requires_washing || data.requiresWashing),
          addons: Array.isArray(data.addons) ? data.addons : [],
          deliveryTier: data.deliveryTier || "standard",
          laundryId: data.laundryId || "",
        } as LaundryOrder;
      });

      // Filter placeholders
      const filtered = list.filter(o => o.delivery_method !== "placeholder" && !o.id.startsWith("placeholder"));
      
      // Sort desc by creation date
      filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      setOrders(filtered);
      setOrdersLoading(false);
    });

    return () => unsub();
  }, []);

  // Sync selected laundry options in real-time
  useEffect(() => {
    if (!selectedLaundry) return;

    setLaundryAddonsLoading(true);
    setLaundryTiersLoading(true);

    const addonsQuery = query(collection(db, "laundry_addons"), where("laundryId", "==", selectedLaundry.id));
    const unsubAddons = onSnapshot(addonsQuery, (snap) => {
      setLaundryAddons(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLaundryAddonsLoading(false);
    });

    const tiersQuery = query(collection(db, "laundry_delivery_tiers"), where("laundryId", "==", selectedLaundry.id));
    const unsubTiers = onSnapshot(tiersQuery, (snap) => {
      setLaundryTiers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLaundryTiersLoading(false);
    });

    return () => {
      unsubAddons();
      unsubTiers();
    };
  }, [selectedLaundry]);

  // Update Profile
  const handleUpdateProfile = async () => {
    if (!editingProfile) return;
    if (!editName.trim() || !editEmail.trim()) {
      toast.error("נא למלא את כל השדות");
      return;
    }

    setIsUpdating(true);
    try {
      const userDocRef = doc(db, "users", editingProfile.id);
      const updateData: Record<string, any> = {
        fullName: editName,
        role: editRole,
      };
      if (editRole === "laundry") {
        updateData.status = editStatus;
      }
      await updateDoc(userDocRef, updateData);

      toast.success("פרופיל המשתמש עודכן בהצלחה!");
      setEditingProfile(null);
      fetchProfiles();
    } catch (err: any) {
      toast.error("שגיאה בעדכון הפרופיל: " + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  // Delete Profile
  const handleDeleteProfile = async (id: string, email: string) => {
    if (email === "talfarage3331@gmail.com") {
      toast.error("לא ניתן למחוק את מנהל המערכת הראשי!");
      return;
    }

    if (!confirm("האם אתה בטוח שברצונך למחוק משתמש זה? פעולה זו היא בלתי הפיכה.")) {
      return;
    }

    try {
      await deleteDoc(doc(db, "users", id));
      toast.success("המשתמש נמחק בהצלחה");
      fetchProfiles();
    } catch (err: any) {
      toast.error("שגיאה במחיקת המשתמש: " + err.message);
    }
  };

  const openEditModal = (profile: Profile) => {
    setEditingProfile(profile);
    setEditName(profile.fullName || "");
    setEditEmail(profile.email || "");
    setEditRole(profile.role || "customer");
    setEditStatus(profile.status || "approved");
  };

  const openLaundrySettingsModal = (profile: Profile) => {
    setSelectedLaundry(profile);
    setEditBusinessName(profile.businessName || "");
    setEditShopSlug(profile.shopSlug || "");
    setEditFullName(profile.fullName || "");
    setEditEmail(profile.email || "");
    setEditStatus(profile.status || "approved");
    setLaundryModalTab("details");
    setShowAddonForm(false);
    setShowTierForm(false);
  };

  // Update Laundry Business Details
  const handleUpdateLaundryDetails = async () => {
    if (!selectedLaundry) return;
    try {
      const userRef = doc(db, "users", selectedLaundry.id);
      await updateDoc(userRef, {
        businessName: editBusinessName,
        shopSlug: editShopSlug,
        fullName: editFullName,
        email: editEmail,
        status: editStatus,
      });
      toast.success("פרטי המכבסה עודכנו בהצלחה!");
      fetchProfiles();
    } catch (err: any) {
      toast.error("שגיאה בעדכון פרטי המכבסה: " + err.message);
    }
  };

  // Customized Addon CRUD
  const handleSaveAddon = async () => {
    if (!selectedLaundry) return;
    if (!addonForm.label.trim()) {
      toast.error("נא להזין שם שירות/תוספת");
      return;
    }
    try {
      if (editingAddonId) {
        await updateDoc(doc(db, "laundry_addons", editingAddonId), {
          label: addonForm.label,
          price: Number(addonForm.price),
          desc: addonForm.desc,
          group: addonForm.group,
          updatedAt: new Date().toISOString(),
        });
        toast.success("התוספת עודכנה בהצלחה!");
      } else {
        await addDoc(collection(db, "laundry_addons"), {
          laundryId: selectedLaundry.id,
          label: addonForm.label,
          price: Number(addonForm.price),
          desc: addonForm.desc,
          group: addonForm.group,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        toast.success("התוספת נוספה בהצלחה!");
      }
      setShowAddonForm(false);
      setEditingAddonId(null);
    } catch (err: any) {
      toast.error("שגיאה בשמירת התוספת: " + err.message);
    }
  };

  const handleDeleteAddon = async (id: string) => {
    if (!confirm("האם למחוק תוספת זו?")) return;
    try {
      await deleteDoc(doc(db, "laundry_addons", id));
      toast.success("התוספת נמחקה בהצלחה!");
    } catch (err: any) {
      toast.error("שגיאה במחיקת התוספת: " + err.message);
    }
  };

  // Delivery Tier CRUD
  const handleSaveTier = async () => {
    if (!selectedLaundry) return;
    if (!tierForm.label.trim()) {
      toast.error("נא להזין שם רמת משלוח");
      return;
    }
    try {
      if (editingTierId) {
        await updateDoc(doc(db, "laundry_delivery_tiers", editingTierId), {
          label: tierForm.label,
          price: Number(tierForm.price),
          desc: tierForm.desc,
          updatedAt: new Date().toISOString(),
        });
        toast.success("רמת המשלוח עודכנה בהצלחה!");
      } else {
        await addDoc(collection(db, "laundry_delivery_tiers"), {
          laundryId: selectedLaundry.id,
          label: tierForm.label,
          price: Number(tierForm.price),
          desc: tierForm.desc,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        toast.success("רמת המשלוח נוספה בהצלחה!");
      }
      setShowTierForm(false);
      setEditingTierId(null);
    } catch (err: any) {
      toast.error("שגיאה בשמירת רמת המשלוח: " + err.message);
    }
  };

  const handleDeleteTier = async (id: string) => {
    if (!confirm("האם למחוק רמת משלוח זו?")) return;
    try {
      await deleteDoc(doc(db, "laundry_delivery_tiers", id));
      toast.success("רמת המשלוח נמחקה בהצלחה!");
    } catch (err: any) {
      toast.error("שגיאה במחיקת רמת המשלוח: " + err.message);
    }
  };

  // Seed default settings for a laundry profile
  const handleSeedDefaults = async () => {
    if (!selectedLaundry) return;
    setIsSeeding(true);
    try {
      const { seedDefaultsIfEmpty } = await import("@/hooks/use-laundry-options");
      await seedDefaultsIfEmpty(selectedLaundry.id);
      toast.success("נטענו שירותי ברירת מחדל בהצלחה!");
    } catch (err: any) {
      toast.error("שגיאה בטעינת ברירות מחדל: " + err.message);
    } finally {
      setIsSeeding(false);
    }
  };

  // Modify Order Status / Price (Cancel Order, etc.)
  const handleUpdateOrderStatus = async (orderId: string, currentOrder: LaundryOrder, newStatus: string) => {
    setUpdatingOrderId(orderId);
    try {
      const customPrice = orderPrices[orderId];
      const updateData: Record<string, any> = { status: newStatus };

      if (customPrice !== undefined && !isNaN(customPrice)) {
        updateData.basePrice = Number(customPrice);
        
        // Calculate full price including addons & delivery tiers
        let addonsPriceSum = 0;
        if (currentOrder.addons && currentOrder.addons.length > 0) {
          currentOrder.addons.forEach((key) => {
            const addObj = resolveAddon(key, currentOrder.laundryId);
            addonsPriceSum += (addObj.price || 0);
          });
        }
        
        const tierObj = resolveTier(currentOrder.deliveryTier || "standard", currentOrder.laundryId);
        const deliveryTierPrice = tierObj.price || 0;
        
        const finalPrice = Number(customPrice) + addonsPriceSum + deliveryTierPrice;
        updateData.price = finalPrice;
        updateData.amount_due = finalPrice;
        updateData.amountDue = finalPrice;
        updateData.total_price = finalPrice;
      }

      await updateDoc(doc(db, "orders", orderId), updateData);

      // Create push notification in database
      const STATUS_PUSH_MAP: Record<string, { event: string; title: string; body: string }> = {
        accepted:  { event: "order_accepted",  title: "ההזמנה התקבלה!",    body: "המכבסה אישרה את ההזמנה שלך והחלה בטיפול." },
        collected: { event: "order_collected", title: "הכביסה נאספה!",    body: "השליח אסף את הכביסה שלך והיא בדרכה למכבסה." },
        ready:     { event: "order_ready",     title: "הכביסה מוכנה!",     body: "הכביסה שלך נקייה, מקופלת ומוכנה למשלוח חזרה." },
        delivered: { event: "order_delivered", title: "הכביסה נמסרה!",     body: "הכביסה שלך נמסרה בהצלחה. תודה שבחרת בנו!" },
        cancelled: { event: "order_cancelled", title: "ההזמנה בוטלה",     body: "ההזמנה שלך בוטלה. לפרטים נוספים פנה לצ'אט." },
      };

      const pushSpec = STATUS_PUSH_MAP[newStatus];
      if (pushSpec && currentOrder.userId) {
        await addDoc(collection(db, "notifications"), {
          userId: currentOrder.userId,
          title: pushSpec.title,
          body: pushSpec.body,
          createdAt: new Date().toISOString(),
          read: false,
        });
      }

      toast.success("ההזמנה עודכנה בהצלחה!");
      setExpandedOrderId(null);
    } catch (err: any) {
      toast.error("שגיאה בעדכון ההזמנה: " + err.message);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  // Filtered profiles (Tab: Users / Laundries)
  const filteredProfiles = profiles.filter((p) => {
    const matchesSearch =
      (p.fullName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.email || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.businessName || "").toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRole = roleFilter === "all"
      ? true
      : roleFilter === "pending_approval"
        ? p.status === "pending_approval"
        : p.role === roleFilter;

    return matchesSearch && matchesRole;
  });

  // Filtered orders
  const filteredOrders = orders.filter((o) => {
    const matchesSearch =
      o.id.toLowerCase().includes(orderSearchQuery.toLowerCase()) ||
      o.user_email.toLowerCase().includes(orderSearchQuery.toLowerCase());

    const matchesStatus = orderStatusFilter === "all" ? true : o.status === orderStatusFilter;

    const matchesLaundry = orderLaundryFilter === "all"
      ? true
      : orderLaundryFilter === "unassigned"
        ? !o.laundryId
        : o.laundryId === orderLaundryFilter;

    return matchesSearch && matchesStatus && matchesLaundry;
  });

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return "bg-rose-100 text-rose-700 border border-rose-200";
      case "laundry":
        return "bg-cyan-100 text-cyan-700 border border-cyan-200";
      default:
        return "bg-slate-100 text-slate-700 border border-slate-200";
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "admin":
        return "מנהל מערכת";
      case "laundry":
        return "צוות מכבסה";
      default:
        return "לקוח";
    }
  };

  // RENDER ORDER CARD HELPER
  const renderOrderCard = (order: LaundryOrder) => {
    const isExpanded = expandedOrderId === order.id;
    const isCancelled = order.status === "cancelled";
    const currentVendorName = profiles.find(p => p.id === order.laundryId)?.businessName || "עצמאי / ללא שיוך";

    return (
      <div key={order.id} className="bg-card border border-muted-foreground/10 rounded-2xl overflow-hidden shadow-sm transition-all hover:shadow-md">
        {/* Header bar click to expand */}
        <div
          onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
          className="px-4 py-3 flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-muted/10"
        >
          <div className="flex items-center gap-2 min-w-0 shrink-0">
            <ChevronDown className={`size-4 text-muted-foreground transition-transform duration-300 ${isExpanded ? "rotate-180 text-primary" : ""}`} />
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${getStatusColor(order.status)}`}>
              {getStatusLabel(order.status)}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-muted-foreground/5 hidden sm:inline">
              #{order.id.slice(0, 8)}
            </span>
          </div>

          <div className="flex-1 min-w-0 px-2 flex items-center justify-between gap-2 text-right">
            <span className="text-xs font-extrabold truncate text-foreground" title={order.user_email}>
              {order.user_email}
            </span>
            <span className="text-[10px] text-muted-foreground whitespace-nowrap hidden md:inline-block">
              מכבסה: {currentVendorName}
            </span>
          </div>

          <div className="shrink-0 text-left">
            <span className="text-sm font-black text-foreground">
              ₪{order.price || order.amount_due || "ממתין"}
            </span>
          </div>
        </div>

        {/* Expandable details panel */}
        <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
          <div className="overflow-hidden">
            <div className="border-t border-muted-foreground/5 mx-4" />
            <div className="px-4 pt-3 pb-4 space-y-4">
              {isCancelled && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/5 text-destructive px-3 py-2 text-xs font-semibold text-right">
                  ❌ הזמנה זו בוטלה. לא ניתן לשנות את מצבה או לתמחר אותה מחדש.
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs" dir="rtl">
                {/* Customer details */}
                <div className="space-y-1.5 text-right">
                  <h4 className="text-[10px] font-black text-primary uppercase">פרטי לקוח & מכבסה</h4>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">אימייל לקוח:</span>
                    <span className="font-bold text-foreground break-all">{order.user_email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">סוג שירות:</span>
                    <span className="font-bold text-foreground">
                      {order.delivery_method === "home_delivery" ? "משלוח 🚗" : "איסוף עצמי 🧺"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">משויך למכבסה:</span>
                    <span className="font-bold text-cyan-700">{currentVendorName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">תאריך הזמנה:</span>
                    <span className="font-semibold text-foreground">
                      {new Date(order.created_at).toLocaleString("he-IL")}
                    </span>
                  </div>
                </div>

                {/* Requirements details */}
                <div className="space-y-1.5 text-right">
                  <h4 className="text-[10px] font-black text-primary uppercase">דרישות וטיפול מיוחד</h4>
                  <div className="flex flex-wrap gap-1.5 mt-1 justify-start">
                    {order.requires_washing && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md font-bold text-[10px]">💦 כביסה רגילה</span>}
                    {order.requires_ironing && <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-md font-bold text-[10px]">♨️ גיהוץ</span>}
                    {order.requires_dry_cleaning && <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-md font-bold text-[10px]">✨ ניקוי יבש</span>}
                  </div>

                  {order.addons && order.addons.length > 0 && (
                    <div className="mt-2">
                      <p className="text-[10px] text-muted-foreground font-bold">תוספות נבחרות:</p>
                      <ul className="list-disc list-inside mt-0.5 space-y-0.5 text-[11px] font-semibold text-foreground">
                        {order.addons.map(addKey => {
                          const addObj = resolveAddon(addKey, order.laundryId);
                          return <li key={addKey}>{addObj.label} (+₪{addObj.price})</li>;
                        })}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Notes & Actions */}
                <div className="space-y-2 text-right">
                  <h4 className="text-[10px] font-black text-primary uppercase">הערות לוגיסטיקה</h4>
                  <p className="text-foreground bg-muted/40 p-2 rounded-xl text-[11px]">
                    <span className="font-bold text-muted-foreground block text-[9px]">הערות לקוח:</span>
                    {order.notes || "אין הערות מיוחדות מהלקוח"}
                  </p>
                  {order.deliveryNotes && (
                    <p className="text-amber-800 bg-amber-50/50 p-2 rounded-xl text-[11px] border border-amber-100">
                      <span className="font-bold text-amber-700 block text-[9px]">הוראות משלוח:</span>
                      {order.deliveryNotes}
                    </p>
                  )}
                </div>
              </div>

              {/* Pricing adjustment & Status CRUD */}
              {!isCancelled && (
                <div className="border-t border-muted-foreground/5 pt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground whitespace-nowrap">מחיר בסיס (₪):</label>
                      <Input
                        type="number"
                        value={orderPrices[order.id] !== undefined ? orderPrices[order.id] : (order.basePrice ?? "")}
                        onChange={(e) => setOrderPrices({ ...orderPrices, [order.id]: Number(e.target.value) })}
                        placeholder="קבע מחיר"
                        className="w-20 h-8 text-xs text-center rounded-lg border-muted-foreground/20 bg-background"
                      />
                    </div>

                    {/* Calculated full sum preview */}
                    {(() => {
                      const base = orderPrices[order.id] !== undefined ? orderPrices[order.id] : (order.basePrice ?? 0);
                      let addonsSum = 0;
                      if (order.addons) {
                        order.addons.forEach(k => { addonsSum += (resolveAddon(k, order.laundryId).price || 0); });
                      }
                      const tier = resolveTier(order.deliveryTier || "standard", order.laundryId).price || 0;
                      const calculatedTotal = (base || 0) + addonsSum + tier;
                      
                      return (
                        <span className="text-[11px] font-extrabold text-foreground">
                          סה"כ לתשלום: <span className="text-xs font-black text-primary">₪{calculatedTotal}</span>
                        </span>
                      );
                    })()}
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      id={`status-select-${order.id}`}
                      defaultValue={order.status}
                      className="h-8 px-2 rounded-lg border border-muted-foreground/20 bg-background text-[11px] font-semibold text-right"
                      dir="rtl"
                    >
                      <option value="pending">⏳ ממתין</option>
                      <option value="accepted">🔵 התקבל</option>
                      <option value="collected">🟡 נאסף</option>
                      <option value="ready">🟢 מוכן</option>
                      <option value="delivered">✅ נמסר</option>
                    </select>

                    <button
                      disabled={updatingOrderId === order.id}
                      onClick={() => {
                        const selectEl = document.getElementById(`status-select-${order.id}`) as HTMLSelectElement;
                        if (selectEl) {
                          handleUpdateOrderStatus(order.id, order, selectEl.value);
                        }
                      }}
                      className="px-3 h-8 bg-primary text-primary-foreground text-[11px] font-extrabold rounded-lg hover:opacity-90 active:scale-95 transition flex items-center justify-center gap-1"
                    >
                      {updatingOrderId === order.id ? "מעדכן..." : "עדכן הזמנה"}
                    </button>

                    <button
                      disabled={updatingOrderId === order.id}
                      onClick={() => {
                        if (confirm("האם אתה בטוח שברצונך לבטל הזמנה זו?")) {
                          handleUpdateOrderStatus(order.id, order, "cancelled");
                        }
                      }}
                      className="px-2.5 h-8 bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground text-[11px] font-extrabold rounded-lg transition active:scale-95 flex items-center justify-center"
                      title="בטל הזמנה"
                    >
                      בטל הזמנה
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <AppLayout>
      <div
        className="min-h-screen bg-background pb-12 dir-rtl text-right overflow-x-hidden"
        dir="rtl"
      >
        {/* Header banner */}
        <header className="bg-lavender px-4 pb-4 sm:px-6 sm:pb-6 pt-safe-lavender rounded-b-[2rem] shadow-sm flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span className="text-[10px] sm:text-xs font-bold text-primary bg-primary/10 px-2.5 sm:px-3 py-1 rounded-full">
              לוח בקרה מנהל
            </span>
            <h1 className="text-lg sm:text-2xl font-black mt-2 text-lavender-foreground truncate">
              {activeTab === "users" && "ניהול פרופילי משתמשים"}
              {activeTab === "laundries" && "ניהול פרופילי מכבסות"}
              {activeTab === "orders" && "הזמנות גלובליות"}
              {activeTab === "pricing" && "מחירון שירותים גלובלי"}
            </h1>
          </div>
          <button
            onClick={() => {
              logout();
              window.location.href = "/login";
            }}
            className="size-11 shrink-0 rounded-2xl bg-background/50 hover:bg-background/80 flex items-center justify-center text-destructive transition-colors active:scale-95 shadow-sm"
            title="התנתק"
          >
            <LogOut className="size-5" />
          </button>
        </header>

        <main className="px-3 sm:px-5 mt-4 sm:mt-6 space-y-4 sm:space-y-6">
          {/* Quick stats grid */}
          <section className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="bg-lavender/40 border border-lavender/50 rounded-2xl p-3 sm:p-4 flex flex-col items-center justify-center text-center">
              <Users className="size-5 sm:size-6 text-primary mb-1" />
              <span className="text-lg sm:text-xl font-black text-foreground">
                {profiles.length}
              </span>
              <span className="text-[9px] sm:text-[10px] text-muted-foreground font-bold">
                סה"כ רשומים
              </span>
            </div>
            <div className="bg-cyan-50 border border-cyan-100 rounded-2xl p-3 sm:p-4 flex flex-col items-center justify-center text-center">
              <UserCheck className="size-5 sm:size-6 text-cyan-600 mb-1" />
              <span className="text-lg sm:text-xl font-black text-cyan-700">
                {profiles.filter((p) => p.role === "laundry").length}
              </span>
              <span className="text-[9px] sm:text-[10px] text-cyan-600 font-bold">מכבסות</span>
            </div>
            <div className="bg-rose-50 border border-rose-100 rounded-2xl p-3 sm:p-4 flex flex-col items-center justify-center text-center">
              <Shield className="size-5 sm:size-6 text-rose-600 mb-1" />
              <span className="text-lg sm:text-xl font-black text-rose-700">
                {profiles.filter((p) => p.role === "admin").length}
              </span>
              <span className="text-[9px] sm:text-[10px] text-rose-600 font-bold">מנהלים</span>
            </div>
          </section>

          {/* Chat Dashboard Link */}
          <button
            onClick={() => navigate({ to: "/admin-chat" })}
            className="w-full bg-primary/10 border-2 border-primary/20 text-primary hover:bg-primary hover:text-primary-foreground hover:border-primary rounded-2xl p-3 sm:p-4 flex items-center justify-between font-extrabold transition-all group active:scale-95 no-underline cursor-pointer min-h-[48px]"
          >
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <div className="relative size-9 sm:size-10 shrink-0 rounded-full bg-background/50 grid place-items-center group-hover:bg-primary-foreground/20">
                <MessageSquareText className="size-4 sm:size-5" />
                {unreadChatCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-[20px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-md">
                    {unreadChatCount > 99 ? "99+" : unreadChatCount}
                  </span>
                )}
              </div>
              <div className="text-right min-w-0">
                <span className="block text-sm sm:text-base truncate">
                  לוח הודעות ללקוחות (צ'אט)
                </span>
                <span className="text-[10px] sm:text-xs opacity-80 font-semibold block mt-0.5 truncate">
                  מענה מיידי ללקוחות בזמן אמת
                </span>
              </div>
            </div>
            <ArrowRight className="size-5 shrink-0 rotate-180 opacity-50 group-hover:opacity-100 group-hover:-translate-x-1 transition-all" />
          </button>

          {/* Tab Navigation */}
          <div className="flex border-b border-muted-foreground/10 mb-4 overflow-x-auto pb-1 gap-2">
            {[
              { key: "users", label: "משתמשים", icon: Users },
              { key: "laundries", label: "מכבסות", icon: Building2 },
              { key: "orders", label: "הזמנות גלובליות", icon: ClipboardList },
              { key: "pricing", label: "מחירון גלובלי", icon: Tag },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => {
                    setActiveTab(tab.key as any);
                    setSearchQuery("");
                  }}
                  className={`flex items-center gap-1.5 px-4 py-2.5 border-b-2 font-bold text-xs sm:text-sm whitespace-nowrap transition-all rounded-t-xl ${
                    activeTab === tab.key
                      ? "border-primary text-primary bg-primary/5"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="size-4 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* TAB CONTENT: Pricing */}
          {activeTab === "pricing" && (
            <AdminPricingPanel />
          )}

          {/* TAB CONTENT: Users */}
          {activeTab === "users" && (
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="relative">
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="חפש לפי שם או אימייל..."
                    className="pr-10 rounded-2xl border-muted-foreground/15 h-11 sm:h-12 text-right text-sm sm:text-base"
                  />
                  <Search className="absolute right-3.5 top-3.5 size-5 text-muted-foreground" />
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1">
                  {[
                    { key: "all", label: "הכל" },
                    { key: "customer", label: "לקוחות" },
                    { key: "admin", label: "מנהלים" },
                  ].map((filter) => (
                    <button
                      key={filter.key}
                      onClick={() => setRoleFilter(filter.key)}
                      className={`px-3 sm:px-4 py-2 rounded-full text-[11px] sm:text-xs font-bold transition-all border active:scale-95 whitespace-nowrap min-h-[36px] ${
                        roleFilter === filter.key
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted text-muted-foreground border-muted-foreground/10"
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-base font-extrabold text-foreground px-1">
                  רשימת משתמשים ({filteredProfiles.filter(p => p.role !== "laundry").length})
                </h2>

                {isLoading ? (
                  <div className="py-20 flex flex-col items-center justify-center gap-2">
                    <div className="animate-spin rounded-full size-8 border-4 border-primary border-t-transparent" />
                    <span className="text-sm text-muted-foreground">טוען משתמשים...</span>
                  </div>
                ) : filteredProfiles.filter(p => p.role !== "laundry").length === 0 ? (
                  <div className="bg-muted/30 border border-muted/50 rounded-3xl p-12 text-center text-muted-foreground">
                    לא נמצאו משתמשים התואמים את הסינון.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredProfiles.filter(p => p.role !== "laundry").map((profile) => (
                      <div
                        key={profile.id}
                        className="bg-card border border-muted-foreground/10 rounded-3xl p-3 sm:p-4 flex items-center justify-between gap-2 shadow-sm transition-all hover:shadow-md"
                      >
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                          <div className="size-10 sm:size-12 shrink-0 rounded-2xl bg-lavender text-primary font-black text-base sm:text-lg flex items-center justify-center">
                            {(profile.fullName || "?")[0]}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="font-extrabold text-foreground text-xs sm:text-sm truncate">
                              {profile.fullName || "משתמש ללא שם"}
                            </h3>
                            <p className="text-[10px] sm:text-xs text-muted-foreground leading-normal mt-0.5 truncate" style={{ overflowWrap: "anywhere" }}>
                              {profile.email}
                            </p>
                            <span className={`inline-block mt-1.5 sm:mt-2 px-2 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold ${getRoleBadge(profile.role)}`}>
                              {getRoleLabel(profile.role)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                          <button
                            onClick={() => openEditModal(profile)}
                            className="size-10 sm:size-9 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 flex items-center justify-center transition active:scale-95"
                            title="ערוך פרופיל"
                          >
                            <Edit2 className="size-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteProfile(profile.id, profile.email)}
                            className="size-10 sm:size-9 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 flex items-center justify-center transition active:scale-95"
                            title="מחק משתמש"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB CONTENT: Laundries */}
          {activeTab === "laundries" && (
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="relative">
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="חפש מכבסה לפי שם עסק או אימייל..."
                    className="pr-10 rounded-2xl border-muted-foreground/15 h-11 sm:h-12 text-right text-sm sm:text-base"
                  />
                  <Search className="absolute right-3.5 top-3.5 size-5 text-muted-foreground" />
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-base font-extrabold text-foreground px-1">
                  רשימת מכבסות רשומות ({filteredProfiles.filter(p => p.role === "laundry").length})
                </h2>

                {isLoading ? (
                  <div className="py-20 flex flex-col items-center justify-center gap-2">
                    <div className="animate-spin rounded-full size-8 border-4 border-primary border-t-transparent" />
                    <span className="text-sm text-muted-foreground">טוען מכבסות...</span>
                  </div>
                ) : filteredProfiles.filter(p => p.role === "laundry").length === 0 ? (
                  <div className="bg-muted/30 border border-muted/50 rounded-3xl p-12 text-center text-muted-foreground">
                    לא נמצאו מכבסות התואמות את החיפוש.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredProfiles.filter(p => p.role === "laundry").map((profile) => (
                      <div
                        key={profile.id}
                        className="bg-card border border-muted-foreground/10 rounded-3xl p-3 sm:p-4 flex items-center justify-between gap-2 shadow-sm transition-all hover:shadow-md"
                      >
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                          <div className="size-10 sm:size-12 shrink-0 rounded-2xl bg-cyan-100 text-cyan-700 font-black text-base sm:text-lg flex items-center justify-center">
                            {(profile.businessName || profile.fullName || "?")[0]}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="font-extrabold text-foreground text-xs sm:text-sm truncate">
                              {profile.businessName || "מכבסה ללא שם"}
                            </h3>
                            <p className="text-[10px] sm:text-xs text-muted-foreground leading-normal mt-0.5 truncate">
                              חנות: {profile.shopSlug ? `/shop/${profile.shopSlug}` : "טרם הוגדר קישור"}
                            </p>
                            <p className="text-[9px] text-muted-foreground truncate">
                              איש קשר: {profile.fullName} | {profile.email}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold ${getRoleBadge(profile.role)}`}>
                                {getRoleLabel(profile.role)}
                              </span>
                              {profile.status === "pending_approval" && (
                                <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                                  ⏳ ממתין לאישור
                                </span>
                              )}
                              {profile.status === "approved" && (
                                <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold bg-green-100 text-green-700 border border-green-200">
                                  ✅ פעיל
                                </span>
                              )}
                              {profile.status === "suspended" && (
                                <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold bg-red-100 text-red-700 border border-red-200">
                                  ❌ מושעה
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                          <button
                            onClick={() => openLaundrySettingsModal(profile)}
                            className="h-10 px-3 sm:px-4 rounded-xl bg-cyan-600 text-white hover:bg-cyan-700 flex items-center justify-center gap-1.5 text-xs font-extrabold transition active:scale-95 shadow-sm"
                            title="נהל שירותים ומחירים"
                          >
                            <Settings className="size-4" />
                            <span className="hidden sm:inline">ניהול שירותים</span>
                          </button>
                          <button
                            onClick={() => openEditModal(profile)}
                            className="size-10 sm:size-9 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 flex items-center justify-center transition active:scale-95"
                            title="ערוך פרופיל"
                          >
                            <Edit2 className="size-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB CONTENT: Orders */}
          {activeTab === "orders" && (
            <div className="space-y-4">
              {/* Order filters */}
              <div className="space-y-3 bg-muted/20 border border-muted-foreground/5 p-4 rounded-3xl">
                <h3 className="text-xs font-black text-primary uppercase tracking-widest">חיפוש וסינון הזמנות</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="relative">
                    <Input
                      value={orderSearchQuery}
                      onChange={(e) => setOrderSearchQuery(e.target.value)}
                      placeholder="חפש לפי מזהה הזמנה או אימייל..."
                      className="pr-9 text-xs rounded-xl h-10 text-right bg-background border-muted-foreground/15"
                    />
                    <Search className="absolute right-3 top-3 size-4 text-muted-foreground" />
                  </div>

                  <div>
                    <select
                      value={orderStatusFilter}
                      onChange={(e) => setOrderStatusFilter(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-muted-foreground/15 bg-background text-xs font-semibold text-right"
                      dir="rtl"
                    >
                      <option value="all">כל הסטטוסים</option>
                      <option value="pending">⏳ ממתין (Pending)</option>
                      <option value="accepted">🔵 התקבל (Accepted)</option>
                      <option value="collected">🟡 נאסף (Collected)</option>
                      <option value="ready">🟢 מוכן (Ready)</option>
                      <option value="delivered">✅ נמסר (Delivered)</option>
                      <option value="cancelled">❌ בוטלה (Cancelled)</option>
                    </select>
                  </div>

                  <div>
                    <select
                      value={orderLaundryFilter}
                      onChange={(e) => setOrderLaundryFilter(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl border border-muted-foreground/15 bg-background text-xs font-semibold text-right"
                      dir="rtl"
                    >
                      <option value="all">כל המכבסות</option>
                      <option value="unassigned">ללא שיוך / עצמאי</option>
                      {profiles.filter(p => p.role === "laundry").map(vendor => (
                        <option key={vendor.id} value={vendor.id}>
                          {vendor.businessName || vendor.fullName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Render Grouped Orders */}
              <div className="space-y-6">
                {ordersLoading ? (
                  <div className="py-20 flex flex-col items-center justify-center gap-2">
                    <div className="animate-spin rounded-full size-8 border-4 border-primary border-t-transparent" />
                    <span className="text-sm text-muted-foreground">טוען הזמנות מהמערכת...</span>
                  </div>
                ) : filteredOrders.length === 0 ? (
                  <div className="bg-muted/30 border border-muted/50 rounded-3xl p-12 text-center text-muted-foreground">
                    לא נמצאו הזמנות רשומות במערכת העונות לסינון.
                  </div>
                ) : (
                  (() => {
                    // Group filtered orders by vendor
                    const vendors = profiles.filter(p => p.role === "laundry");
                    const unassignedOrders = filteredOrders.filter(o => !o.laundryId || !vendors.some(v => v.id === o.laundryId));
                    
                    return (
                      <div className="space-y-6">
                        {/* 1. Grouped by registered vendors */}
                        {vendors.map(vendor => {
                          const vendorOrders = filteredOrders.filter(o => o.laundryId === vendor.id);
                          if (vendorOrders.length === 0) return null;

                          return (
                            <div key={vendor.id} className="space-y-3 bg-card border border-muted-foreground/10 rounded-[2rem] p-4 shadow-sm">
                              <div className="flex items-center gap-2 border-b border-muted-foreground/5 pb-2 mb-2">
                                <Building2 className="size-4 text-cyan-600" />
                                <h3 className="text-sm font-black text-cyan-800">
                                  {vendor.businessName || vendor.fullName} ({vendorOrders.length} הזמנות)
                                </h3>
                              </div>

                              <div className="space-y-3">
                                {vendorOrders.map(order => renderOrderCard(order))}
                              </div>
                            </div>
                          );
                        })}

                        {/* 2. Unassigned Group */}
                        {unassignedOrders.length > 0 && (
                          <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-[2rem] p-4 shadow-sm">
                            <div className="flex items-center gap-2 border-b border-slate-200 pb-2 mb-2">
                              <XCircle className="size-4 text-slate-500" />
                              <h3 className="text-sm font-black text-slate-700">
                                הזמנות עצמאיות / ללא שיוך למכבסה ({unassignedOrders.length} הזמנות)
                              </h3>
                            </div>

                            <div className="space-y-3">
                              {unassignedOrders.map(order => renderOrderCard(order))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Dialog 1: General User Edit Modal */}
      <Dialog
        open={editingProfile !== null}
        onOpenChange={(open) => !open && setEditingProfile(null)}
      >
        <DialogContent
          className="max-w-md w-[96%] sm:w-[92%] rounded-2xl sm:rounded-3xl p-4 sm:p-6 text-right dir-rtl backdrop-blur-xl bg-background/95 border-none shadow-[0_20px_50px_rgba(0,0,0,0.15)] focus:outline-none max-h-[90dvh] overflow-y-auto"
          dir="rtl"
        >
          <DialogHeader className="space-y-2 text-right">
            <DialogTitle className="text-lg sm:text-xl font-black text-foreground flex items-center gap-2">
              <Shield className="size-5 text-primary" />
              <span>עריכת פרופיל משתמש</span>
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground text-right">
              שנה את פרטי המשתמש או את הרשאות הגישה שלו במערכת
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 sm:space-y-4 my-3 sm:my-4 text-right">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground block">שם מלא</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="שם מלא"
                className="text-right"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground block">אימייל</label>
              <Input
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                placeholder="אימייל"
                className="text-right text-left"
                disabled={editingProfile?.email === "talfarage3331@gmail.com"}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground block">תפקיד / הרשאה</label>
              <select
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as any)}
                className="w-full h-11 px-3 rounded-xl border border-muted-foreground/20 bg-background text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary text-right appearance-none"
                disabled={editingProfile?.email === "talfarage3331@gmail.com"}
                dir="rtl"
              >
                <option value="customer">לקוח (Customer)</option>
                <option value="laundry">צוות מכבסה (Laundry)</option>
                <option value="admin">מנהל מערכת (Admin)</option>
              </select>
            </div>

            {editRole === "laundry" && (
              <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-200">
                <label className="text-xs font-bold text-foreground block">סטטוס אישור</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  className="w-full h-11 px-3 rounded-xl border border-muted-foreground/20 bg-background text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary text-right appearance-none"
                  dir="rtl"
                >
                  <option value="pending_approval">⏳ ממתין לאישור (Pending)</option>
                  <option value="approved">✅ מאושר (Approved)</option>
                  <option value="suspended">❌ מושעה (Suspended)</option>
                </select>
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-2">
            <button
              onClick={handleUpdateProfile}
              disabled={isUpdating}
              className="flex-1 h-11 sm:h-12 rounded-2xl bg-primary text-primary-foreground text-sm sm:text-base font-bold active:scale-95 transition flex items-center justify-center disabled:opacity-50 min-h-[44px]"
            >
              {isUpdating ? "מעדכן..." : "שמור שינויים"}
            </button>
            <button
              onClick={() => setEditingProfile(null)}
              className="h-11 sm:h-12 px-4 sm:px-5 rounded-2xl border border-muted-foreground/20 text-sm sm:text-base font-bold active:scale-95 transition min-h-[44px]"
            >
              ביטול
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog 2: Laundry Profile & Services CRUD Management Modal */}
      <Dialog
        open={selectedLaundry !== null}
        onOpenChange={(open) => !open && setSelectedLaundry(null)}
      >
        <DialogContent
          className="max-w-xl w-[96%] sm:w-[92%] rounded-2xl sm:rounded-3xl p-4 sm:p-6 text-right dir-rtl backdrop-blur-xl bg-background/95 border-none shadow-[0_20px_50px_rgba(0,0,0,0.15)] focus:outline-none max-h-[90dvh] overflow-y-auto"
          dir="rtl"
        >
          <DialogHeader className="space-y-1 text-right">
            <DialogTitle className="text-lg sm:text-xl font-black text-foreground flex items-center gap-2">
              <Building2 className="size-5 text-primary" />
              <span>ניהול שירותי מכבסה: {selectedLaundry?.businessName || selectedLaundry?.fullName}</span>
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-muted-foreground text-right">
              ערוך את פרטי העסק, הוסף או שנה שירותים/תוספות וקבע רמות תמחור
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 my-4 text-right">
            {/* Tab navigation within Laundry Modal */}
            <div className="flex gap-2 border-b border-muted-foreground/10 pb-2">
              <button
                onClick={() => setLaundryModalTab("details")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  laundryModalTab === "details" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                פרטי עסק
              </button>
              <button
                onClick={() => setLaundryModalTab("addons")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  laundryModalTab === "addons" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                שירותים ותוספות ({laundryAddons.length})
              </button>
              <button
                onClick={() => setLaundryModalTab("tiers")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  laundryModalTab === "tiers" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                רמות משלוח ותמחור ({laundryTiers.length})
              </button>
            </div>

            {/* TAB: details */}
            {laundryModalTab === "details" && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground block">שם עסק במערכת</label>
                  <Input value={editBusinessName} onChange={(e) => setEditBusinessName(e.target.value)} placeholder="שם עסק" className="text-right" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground block">קישור ייחודי (Slug)</label>
                  <Input value={editShopSlug} onChange={(e) => setEditShopSlug(e.target.value)} placeholder="slug" className="text-right text-left font-mono text-xs" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground block">שם איש קשר</label>
                  <Input value={editFullName} onChange={(e) => setEditFullName(e.target.value)} placeholder="שם מלא" className="text-right" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground block">אימייל מכבסה</label>
                  <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="אימייל" className="text-right text-left" disabled />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground block">סטטוס אישור</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as any)}
                    className="w-full h-11 px-3 rounded-xl border border-muted-foreground/20 bg-background text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary text-right"
                    dir="rtl"
                  >
                    <option value="pending_approval">⏳ ממתין לאישור</option>
                    <option value="approved">✅ מאושר ופעיל</option>
                    <option value="suspended">❌ מושעה</option>
                  </select>
                </div>
                <button
                  onClick={handleUpdateLaundryDetails}
                  className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-bold active:scale-95 transition mt-2"
                >
                  שמור פרטי עסק
                </button>
              </div>
            )}

            {/* TAB: addons */}
            {laundryModalTab === "addons" && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs sm:text-sm font-bold text-foreground">שירותים ותוספות מותאמים אישית</h3>
                  {laundryAddons.length === 0 && (
                    <button
                      onClick={handleSeedDefaults}
                      disabled={isSeeding}
                      className="px-3 py-1 rounded-lg bg-amber-500 text-white text-xs font-extrabold flex items-center gap-1 active:scale-95 transition"
                    >
                      {isSeeding ? "טוען..." : "טען ברירת מחדל"}
                    </button>
                  )}
                </div>

                {/* Inline form for Add / Edit Addon */}
                {showAddonForm && (
                  <div className="p-3 border border-muted-foreground/15 bg-muted/20 rounded-2xl space-y-3">
                    <h4 className="text-xs font-black text-primary">{editingAddonId ? "עריכת שירות/תוספת" : "הוספת שירות/תוספת חדשה"}</h4>
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground block">שם השירות</label>
                        <Input
                          value={addonForm.label}
                          onChange={(e) => setAddonForm(prev => ({ ...prev, label: e.target.value }))}
                          placeholder="למשל: אקסטרה ריח"
                          className="text-right text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground block">תוספת מחיר (₪)</label>
                        <Input
                          type="number"
                          value={addonForm.price === 0 ? "" : addonForm.price}
                          onChange={(e) => setAddonForm(prev => ({ ...prev, price: Number(e.target.value) }))}
                          placeholder="0"
                          className="text-right text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground block">תיאור השירות</label>
                        <Input
                          value={addonForm.desc}
                          onChange={(e) => setAddonForm(prev => ({ ...prev, desc: e.target.value }))}
                          placeholder="תיאור קצר של הטיפול"
                          className="text-right text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground block">קבוצה / קטגוריה</label>
                        <select
                          value={addonForm.group}
                          onChange={(e) => setAddonForm(prev => ({ ...prev, group: e.target.value }))}
                          className="w-full h-9 px-2 rounded-lg border border-muted-foreground/10 bg-background text-xs"
                        >
                          <option value="שדרוגי פרימיום">שדרוגי פרימיום</option>
                          <option value="סוגי טיפול מיוחדים">סוגי טיפול מיוחדים</option>
                          <option value="חוויית לוגיסטיקה">חוויית לוגיסטיקה</option>
                          <option value="שירותי איסוף עצמי">שירותי איסוף עצמי</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={handleSaveAddon} className="flex-1 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold">שמור תוספת</button>
                      <button onClick={() => { setShowAddonForm(false); setEditingAddonId(null); }} className="px-3 py-1.5 border border-muted-foreground/20 rounded-lg text-xs">ביטול</button>
                    </div>
                  </div>
                )}

                {!showAddonForm && (
                  <button
                    onClick={() => {
                      setAddonForm({ label: "", price: 0, desc: "", group: "שדרוגי פרימיום" });
                      setEditingAddonId(null);
                      setShowAddonForm(true);
                    }}
                    className="w-full py-2 border-2 border-dashed border-primary/20 hover:border-primary text-primary text-xs font-bold rounded-xl flex items-center justify-center gap-1 transition"
                  >
                    <PlusCircle className="size-3.5" />
                    <span>הוסף שירות/תוספת מותאמת</span>
                  </button>
                )}

                {laundryAddonsLoading ? (
                  <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-primary size-6" /></div>
                ) : laundryAddons.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center">אין שירותים ותוספות מוגדרים.</p>
                ) : (
                  <div className="space-y-2 max-h-[35vh] overflow-y-auto pr-1">
                    {laundryAddons.map(addon => (
                      <div key={addon.id} className="p-3 border border-muted-foreground/10 rounded-2xl flex items-center justify-between gap-2 bg-card">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-extrabold text-foreground">{addon.label}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{addon.desc || "ללא תיאור"}</p>
                          <span className="inline-block mt-1 px-1.5 py-0.5 bg-muted text-muted-foreground text-[9px] rounded-md font-bold">{addon.group}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-primary whitespace-nowrap">₪{addon.price}</span>
                          <button
                            onClick={() => {
                              setAddonForm({ label: addon.label, price: addon.price, desc: addon.desc || "", group: addon.group || "שדרוגי פרימיום" });
                              setEditingAddonId(addon.id);
                              setShowAddonForm(true);
                            }}
                            className="p-1 text-primary hover:bg-primary/10 rounded-md"
                          >
                            <Edit2 className="size-3.5" />
                          </button>
                          <button onClick={() => handleDeleteAddon(addon.id)} className="p-1 text-destructive hover:bg-destructive/10 rounded-md">
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB: tiers */}
            {laundryModalTab === "tiers" && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs sm:text-sm font-bold text-foreground">רמות משלוח, מהירות ותמחור</h3>
                  {laundryTiers.length === 0 && (
                    <button
                      onClick={handleSeedDefaults}
                      disabled={isSeeding}
                      className="px-3 py-1 rounded-lg bg-amber-500 text-white text-xs font-extrabold flex items-center gap-1 active:scale-95 transition"
                    >
                      {isSeeding ? "טוען..." : "טען ברירת מחדל"}
                    </button>
                  )}
                </div>

                {/* Inline form for Add / Edit Tier */}
                {showTierForm && (
                  <div className="p-3 border border-muted-foreground/15 bg-muted/20 rounded-2xl space-y-3">
                    <h4 className="text-xs font-black text-primary">{editingTierId ? "עריכת רמת משלוח" : "הוספת רמת משלוח חדשה"}</h4>
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground block">שם רמת משלוח</label>
                        <Input
                          value={tierForm.label}
                          onChange={(e) => setTierForm(prev => ({ ...prev, label: e.target.value }))}
                          placeholder="למשל: משלוח אקספרס"
                          className="text-right text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground block">תוספת מחיר (₪)</label>
                        <Input
                          type="number"
                          value={tierForm.price === 0 ? "" : tierForm.price}
                          onChange={(e) => setTierForm(prev => ({ ...prev, price: Number(e.target.value) }))}
                          placeholder="0"
                          className="text-right text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground block">תיאור וזמני הגעה</label>
                        <Input
                          value={tierForm.desc}
                          onChange={(e) => setTierForm(prev => ({ ...prev, desc: e.target.value }))}
                          placeholder="למשל: איסוף והחזרה תוך 24 שעות"
                          className="text-right text-xs"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={handleSaveTier} className="flex-1 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold">שמור רמת משלוח</button>
                      <button onClick={() => { setShowTierForm(false); setEditingTierId(null); }} className="px-3 py-1.5 border border-muted-foreground/20 rounded-lg text-xs">ביטול</button>
                    </div>
                  </div>
                )}

                {!showTierForm && (
                  <button
                    onClick={() => {
                      setTierForm({ label: "", price: 0, desc: "" });
                      setEditingTierId(null);
                      setShowTierForm(true);
                    }}
                    className="w-full py-2 border-2 border-dashed border-primary/20 hover:border-primary text-primary text-xs font-bold rounded-xl flex items-center justify-center gap-1 transition"
                  >
                    <PlusCircle className="size-3.5" />
                    <span>הוסף רמת משלוח/תמחור</span>
                  </button>
                )}

                {laundryTiersLoading ? (
                  <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-primary size-6" /></div>
                ) : laundryTiers.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center">אין רמות משלוח ותמחור מוגדרות.</p>
                ) : (
                  <div className="space-y-2 max-h-[35vh] overflow-y-auto pr-1">
                    {laundryTiers.map(tier => (
                      <div key={tier.id} className="p-3 border border-muted-foreground/10 rounded-2xl flex items-center justify-between gap-2 bg-card">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-extrabold text-foreground">{tier.label}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{tier.desc || "ללא תיאור"}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-primary whitespace-nowrap">₪{tier.price}</span>
                          <button
                            onClick={() => {
                              setTierForm({ label: tier.label, price: tier.price, desc: tier.desc || "" });
                              setEditingTierId(tier.id);
                              setShowTierForm(true);
                            }}
                            className="p-1 text-primary hover:bg-primary/10 rounded-md"
                          >
                            <Edit2 className="size-3.5" />
                          </button>
                          <button onClick={() => handleDeleteTier(tier.id)} className="p-1 text-destructive hover:bg-destructive/10 rounded-md">
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end mt-4 pt-3 border-t border-muted-foreground/5">
            <button
              onClick={() => setSelectedLaundry(null)}
              className="h-11 px-6 rounded-2xl bg-muted text-foreground text-sm font-bold active:scale-95 transition"
            >
              סגור חלון
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
