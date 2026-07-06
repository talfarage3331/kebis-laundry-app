import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useLaundry } from "@/lib/laundry-store";
import { db } from "@/lib/firebase";
import { authFetch } from "@/lib/auth-fetch";
import { AdminPricingPanel } from "@/components/AdminPricingPanel";
import { useLaundryOptions } from "@/hooks/use-laundry-options";
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  setDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  addDoc,
  serverTimestamp,
  limit,
  startAfter,
  getCountFromServer,
  type DocumentSnapshot,
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
  status?: "pending_setup" | "pending_approval" | "approved" | "suspended";
  businessName?: string;
  shopSlug?: string;
  associatedLaundryId?: string;
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
  const { user, logout, isProfileReady } = useLaundry();
  const { resolveAddon, resolveTier } = useLaundryOptions();
  const navigate = useNavigate();

  // Redirect non-admins
  useEffect(() => {
    if (isProfileReady) {
      if (!user || user.role !== "admin") {
        toast.error("אין הרשאת גישה לפאנל זה");
        navigate({ to: "/login" });
      }
    }
  }, [isProfileReady, user, navigate]);

  // Tab State
  const [activeTab, setActiveTab] = useState<"users" | "laundries" | "orders" | "pricing" | "messages">("users");

  // User Profiles State
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  // Pagination for profiles
  const [lastProfileDoc, setLastProfileDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMoreProfiles, setHasMoreProfiles] = useState(false);
  const [loadingMoreProfiles, setLoadingMoreProfiles] = useState(false);

  // Edit User State
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<"admin" | "laundry" | "customer">("customer");
  const [editStatus, setEditStatus] = useState<"pending_setup" | "pending_approval" | "approved" | "suspended">("approved");
  const [editAssignedLaundryId, setEditAssignedLaundryId] = useState<string>("");
  const [isReassigningLaundry, setIsReassigningLaundry] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  // Global Orders State — active orders (real-time) + historical orders (paginated)
  const [activeOrders, setActiveOrders] = useState<LaundryOrder[]>([]);
  const [historicalOrders, setHistoricalOrders] = useState<LaundryOrder[]>([]);
  const [lastHistoricalDoc, setLastHistoricalDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMoreHistorical, setHasMoreHistorical] = useState(false);
  const [loadingMoreHistorical, setLoadingMoreHistorical] = useState(false);
  // Combined for display when no status filter or filter = active statuses
  const [orders, setOrders] = useState<LaundryOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [orderSearchQuery, setOrderSearchQuery] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");
  const [orderLaundryFilter, setOrderLaundryFilter] = useState("all");
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const PROFILES_PAGE_SIZE = 30;
  const ORDERS_PAGE_SIZE = 30;
  const ACTIVE_STATUSES = ["pending", "accepted", "collected", "ready"];

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

  // Messaging System State
  const [msgSubject, setMsgSubject] = useState("");
  const [msgContent, setMsgContent] = useState("");
  const [msgAudience, setMsgAudience] = useState<"all" | "laundries" | "specific_laundry">("all");
  const [msgTargetLaundryId, setMsgTargetLaundryId] = useState("");
  const [isSendingMsg, setIsSendingMsg] = useState(false);

  // Fetch unread chat messages count for admin — scoped query instead of full collectionGroup scan
  useEffect(() => {
    if (!user?.email) return;

    // Listen only to unread messages not sent by this user; avoids downloading all messages
    const unreadQuery = query(
      collectionGroup(db, "messages"),
      where("is_read", "==", false),
      where("sender_email", "!=", user.email),
    );
    const unsubscribe = onSnapshot(
      unreadQuery,
      (snapshot) => setUnreadChatCount(snapshot.size),
      (err) => console.error("[admin] unread chat count error:", err),
    );

    return () => unsubscribe();
  }, [user?.email]);

  // Fetch Profiles — cursor-based pagination (30 per page)
  const fetchProfiles = async (reset = true) => {
    if (reset) {
      setIsLoading(true);
      setLastProfileDoc(null);
      setHasMoreProfiles(false);
    } else {
      setLoadingMoreProfiles(true);
    }
    try {
      const usersRef = collection(db, "users");
      const constraints: any[] = [orderBy("email", "asc"), limit(PROFILES_PAGE_SIZE)];
      if (!reset && lastProfileDoc) constraints.push(startAfter(lastProfileDoc));
      const q = query(usersRef, ...constraints);
      const snapshot = await getDocs(q);

      const data: Profile[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        fullName: docSnap.data().fullName || "",
        email: docSnap.data().email || "",
        role: docSnap.data().role || "customer",
        status: docSnap.data().status,
        businessName: docSnap.data().businessName || "",
        shopSlug: docSnap.data().shopSlug || docSnap.data().slug || "",
        associatedLaundryId: docSnap.data().associatedLaundryId || "",
      }));

      if (reset) {
        setProfiles(data);
      } else {
        setProfiles((prev) => [...prev, ...data]);
      }
      setLastProfileDoc(snapshot.docs[snapshot.docs.length - 1] ?? null);
      setHasMoreProfiles(snapshot.docs.length === PROFILES_PAGE_SIZE);
    } catch (err: any) {
      toast.error("שגיאה בטעינת משתמשים: " + err.message);
    } finally {
      setIsLoading(false);
      setLoadingMoreProfiles(false);
    }
  };

  useEffect(() => {
    if (!isProfileReady || !user || user.role !== "admin") return;
    fetchProfiles(true);
  }, [isProfileReady, user?.uid, user?.role]);

  // Helper: parse a Firestore order doc snapshot into LaundryOrder
  const parseOrderDoc = (docSnap: any): LaundryOrder | null => {
    try {
      const data = docSnap.data() ?? {};
      let parsedImages: string[] = [];
      if (Array.isArray(data.images)) {
        parsedImages = data.images.filter((img: any) => typeof img === "string");
      } else if (typeof data.images === "string" && data.images) {
        try {
          const parsed = JSON.parse(data.images);
          parsedImages = Array.isArray(parsed) ? parsed : [];
        } catch { parsedImages = []; }
      }
      const order: LaundryOrder = {
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
      };
      if (order.delivery_method === "placeholder" || order.id.startsWith("placeholder")) return null;
      return order;
    } catch { return null; }
  };

  // Real-time listener — active orders ONLY (pending/accepted/collected/ready)
  // Historical orders (delivered/cancelled) are fetched on-demand via paginated getDocs
    // Real-time listener — loading all orders (limit 300) to avoid composite index requirements
  useEffect(() => {
    if (!isProfileReady || !user || user.role !== "admin") return;
    setOrdersLoading(true);
    const q = query(
      collection(db, "orders"),
      orderBy("created_at", "desc"),
      limit(300),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const parsed = snap.docs.map(parseOrderDoc).filter(Boolean) as LaundryOrder[];
        setOrders(parsed);
        setActiveOrders(parsed.filter(o => ACTIVE_STATUSES.includes(o.status)));
        setOrdersLoading(false);
      },
      (err) => {
        console.error("[admin] orders listener error (falling back to unsorted fetch):", err);
        const fallbackQ = query(collection(db, "orders"), limit(300));
        onSnapshot(
          fallbackQ,
          (fallbackSnap) => {
            const parsed = fallbackSnap.docs.map(parseOrderDoc).filter(Boolean) as LaundryOrder[];
            parsed.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            setOrders(parsed);
            setActiveOrders(parsed.filter(o => ACTIVE_STATUSES.includes(o.status)));
            setOrdersLoading(false);
          },
          (fallbackErr) => {
            console.error("[admin] fallback orders listener error:", fallbackErr);
            setOrdersLoading(false);
          }
        );
      },
    );
    return () => unsub();
  }, [isProfileReady, user?.uid, user?.role]);

  // Fetch first page of historical orders (delivered/cancelled) on mount
    // Dummy function: all orders are now fetched in real-time
  const fetchHistoricalOrders = async (reset = true) => {
    // No-op
  };

  useEffect(() => {
    if (!isProfileReady || !user || user.role !== "admin") return;
    fetchHistoricalOrders(true);
  }, [isProfileReady, user?.uid, user?.role]);

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

      // Always write role explicitly. For laundry, persist the chosen status;
      // for any other role, clear the status field so stale laundry-status
      // data never shadows the new role on subsequent reads.
      const updateData: Record<string, any> = {
        fullName: editName,
        email: editEmail,
        role: editRole,
        // Explicitly set or null-out status so there is never a mismatch
        // between the stored role and a leftover status from a previous role.
        status: editRole === "laundry" ? editStatus : null,
      };

      await updateDoc(userDocRef, updateData);

      // ── Optimistic local update ──────────────────────────────────────────
      // Update the local profiles array immediately so the UI reflects the
      // change right away, independent of whether fetchProfiles() returns
      // fresh or stale data from the Firestore local cache.
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === editingProfile.id
            ? {
                ...p,
                fullName: editName,
                email: editEmail,
                role: editRole,
                status: editRole === "laundry" ? editStatus : undefined,
              }
            : p,
        ),
      );

      toast.success("פרופיל המשתמש עודכן בהצלחה!");
      setEditingProfile(null);
      // Also trigger a background refresh to catch any other fields that may
      // have changed server-side (e.g., via Cloud Functions).
      fetchProfiles();
    } catch (err: any) {
      toast.error("שגיאה בעדכון הפרופיל: " + err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  // Delete Profile
  const handleDeleteProfile = async (id: string, email: string) => {
    const profile = profiles.find(p => p.id === id);
    if (profile?.role === "admin") {
      toast.error("לא ניתן למחוק מנהל מערכת!");
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
    setEditAssignedLaundryId(profile.associatedLaundryId || "");
  };

  // Admin: reassign a customer to a different laundry vendor.
  // All work happens server-side (admin API) — the endpoint deletes any
  // pre-existing per-tenant customer profile, upserts the new one, and
  // patches `users/{uid}.associatedLaundryId` so downstream queries reflect
  // the change immediately.
  const handleReassignLaundry = async () => {
    if (!editingProfile) return;
    const targetLaundryId = editAssignedLaundryId.trim();
    if (!targetLaundryId) {
      toast.error("נא לבחור מכבסה");
      return;
    }
    if (targetLaundryId === (editingProfile.associatedLaundryId || "")) {
      toast.info("המכבסה שנבחרה זהה למכבסה הנוכחית");
      return;
    }
    setIsReassigningLaundry(true);
    try {
      const res = await authFetch("/api/admin/reassign-customer-laundry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerUid: editingProfile.id,
          newLaundryId: targetLaundryId,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `שגיאה (${res.status})`);
      }
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === editingProfile.id
            ? { ...p, associatedLaundryId: targetLaundryId }
            : p,
        ),
      );
      setEditingProfile({
        ...editingProfile,
        associatedLaundryId: targetLaundryId,
      });
      toast.success("שיוך המכבסה עודכן בהצלחה");
    } catch (err: any) {
      console.error("[admin] reassign laundry failed:", err);
      toast.error("שגיאה בעדכון שיוך המכבסה: " + (err?.message || "unknown"));
    } finally {
      setIsReassigningLaundry(false);
    }
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

  // Delete Order
  const handleDeleteOrder = async (orderId: string) => {
    if (!confirm("האם אתה בטוח שברצונך למחוק הזמנה זו לצמיתות? פעולה זו בלתי הפיכה.")) return;
    try {
      await deleteDoc(doc(db, "orders", orderId));
      setOrders(prev => prev.filter(o => o.id !== orderId));
      toast.success("ההזמנה נמחקה בהצלחה");
    } catch (err: any) {
      toast.error("שגיאה במחיקת ההזמנה: " + err.message);
    }
  };

  // Send Targeted Message
  const handleSendMessage = async () => {
    if (!msgSubject.trim() || !msgContent.trim()) {
      toast.error("נא למלא את נושא ותוכן ההודעה");
      return;
    }
    if (msgAudience === "specific_laundry" && !msgTargetLaundryId) {
      toast.error("נא לבחור מכבסה ספציפית");
      return;
    }
    setIsSendingMsg(true);
    try {
      let targets: { id: string; email: string }[] = [];

      if (msgAudience === "all") {
        const snapshot = await getDocs(collection(db, "users"));
        targets = snapshot.docs
          .map(doc => ({ id: doc.id, email: doc.data().email }))
          .filter(t => t.email);
      } else if (msgAudience === "laundries") {
        const q = query(collection(db, "users"), where("role", "==", "laundry"));
        const snapshot = await getDocs(q);
        targets = snapshot.docs
          .map(doc => ({ id: doc.id, email: doc.data().email }))
          .filter(t => t.email);
      } else if (msgAudience === "specific_laundry") {
        // Send to all customers who have orders with this laundry
        const q = query(collection(db, "orders"), where("laundryId", "==", msgTargetLaundryId));
        const snapshot = await getDocs(q);
        const customerIds = new Set(
          snapshot.docs.map(doc => doc.data().userId).filter(Boolean)
        );
        
        // Fetch profile details for these user IDs to resolve their emails
        const userPromises = Array.from(customerIds).map(async (uid) => {
          const userSnap = await getDoc(doc(db, "users", uid as string));
          if (userSnap.exists()) {
            return { id: uid as string, email: userSnap.data().email };
          }
          return null;
        });
        const resolvedUsers = await Promise.all(userPromises);
        targets = resolvedUsers.filter((u): u is { id: string; email: string } => u !== null && !!u.email);
      }

      if (targets.length === 0) {
        toast.error("לא נמצאו נמענים לשליחה");
        setIsSendingMsg(false);
        return;
      }

      const senderEmail = user?.email || "admin@kebisa.co.il";

      // Process each target recipient
      const sendPromises = targets.map(async ({ id: userId, email }) => {
        // 1. Ensure parent chat document exists
        const chatDocRef = doc(db, "chats", email);
        const chatDocSnap = await getDoc(chatDocRef);
        if (!chatDocSnap.exists()) {
          await setDoc(chatDocRef, {
            customer_email: email,
            updated_at: new Date().toISOString(),
          });
        } else {
          await updateDoc(chatDocRef, {
            updated_at: new Date().toISOString(),
          });
        }

        // 2. Add message to the chat's messages subcollection
        await addDoc(collection(db, "chats", email, "messages"), {
          sender_email: senderEmail,
          content: `📢 **${msgSubject}**\n\n${msgContent}`,
          is_read: false,
          created_at: new Date().toISOString(),
          participantIds: [user?.uid || "", userId],
        });

        // 3. Save notification document to Firestore notifications collection
        await addDoc(collection(db, "notifications"), {
          userId,
          title: msgSubject,
          body: msgContent,
          createdAt: new Date().toISOString(),
          read: false,
          type: "admin_broadcast",
        });

        // 4. Trigger push notification via chat-to-customer event
        try {
          const res = await authFetch("/api/push/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId,
              userEmail: email,
              event: "chat-to-customer",
              customTitle: msgSubject,
              customBody: msgContent,
              url: "/chat",
            }),
          });
          const data = await res.json().catch(() => null);
          if (!res.ok) {
            console.warn(`[push-broadcast] Failed to notify ${email}: ${data?.error || res.status}`);
          }
        } catch (err) {
          console.error(`[push-broadcast] Error notifying ${email}:`, err);
        }
      });

      await Promise.all(sendPromises);

      toast.success(`ההודעה נשלחה בהצלחה ל-${targets.length} נמענים!`);
      setMsgSubject("");
      setMsgContent("");
      setMsgAudience("all");
      setMsgTargetLaundryId("");
    } catch (err: any) {
      toast.error("שגיאה בשליחת ההודעה: " + err.message);
    } finally {
      setIsSendingMsg(false);
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
  // Filtered laundries specifically for the Laundries tab (ignoring roleFilter)
  const filteredLaundries = profiles.filter((p) => {
    if (p.role !== "laundry") return false;
    const matchesSearch =
      (p.fullName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.email || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.businessName || "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

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

  // ── Sidebar state (mobile hamburger) ──────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
                    <button
                      disabled={updatingOrderId === order.id}
                      onClick={() => handleDeleteOrder(order.id)}
                      className="size-8 bg-rose-100 text-rose-600 hover:bg-rose-600 hover:text-white rounded-lg transition active:scale-95 flex items-center justify-center"
                      title="מחק הזמנה לצמיתות"
                    >
                      <Trash2 className="size-3.5" />
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

  // ── Nav config ──────────────────────────────────────────────────────
  const adminNavItems = [
    { key: "users"     as const, label: "משתמשים",         icon: <Users className="size-4 shrink-0" />,         badge: profiles.filter(p => p.role !== "laundry" && p.status === "pending_approval").length || undefined },
    { key: "laundries" as const, label: "מכבסות",           icon: <Building2 className="size-4 shrink-0" />,     badge: profiles.filter(p => p.role === "laundry" && p.status === "pending_approval").length || undefined },
    { key: "orders"    as const, label: "הזמנות גלובליות", icon: <ClipboardList className="size-4 shrink-0" />, badge: activeOrders.length || undefined },
    { key: "pricing"   as const, label: "מחירונים",         icon: <Tag className="size-4 shrink-0" />,           badge: undefined },
    { key: "messages"  as const, label: "לוח הודעות",       icon: <MessageSquareText className="size-4 shrink-0" />, badge: undefined },
  ];

  return (
    <AppLayout>
      <div className="dashboard-layout" dir="rtl">

        {/* ── Mobile hamburger ──────────────────────────────────────────── */}
        <button
          className="hamburger-btn"
          onClick={() => setSidebarOpen(true)}
          aria-label="פתח תפריט"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="17" y2="6" /><line x1="3" y1="10" x2="17" y2="10" /><line x1="3" y1="14" x2="17" y2="14" />
          </svg>
        </button>

        {/* ── Backdrop ──────────────────────────────────────────────────── */}
        <div className={`sidebar-backdrop ${sidebarOpen ? "visible" : ""}`} onClick={() => setSidebarOpen(false)} />

        {/* ═══════════════════════════════════════════════════════════════
            SIDEBAR
        ════════════════════════════════════════════════════════════════ */}
        <aside className={`dashboard-sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>

          {/* Brand */}
          <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
            <div className="size-10 rounded-xl bg-white/15 flex items-center justify-center text-xl shadow-inner shrink-0">🛡️</div>
            <div className="min-w-0">
              <p className="text-white font-black text-sm leading-tight">לוח בקרה מנהל</p>
              <p className="text-[10px] font-semibold truncate" style={{ color: "var(--sidebar-muted)" }}>{user?.email}</p>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="mr-auto shrink-0 size-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 transition md:hidden"
              aria-label="סגור תפריט"
            >
              <X className="size-3.5" />
            </button>
          </div>

          {/* KPI mini-strip */}
          <div className="px-4 pt-3 pb-2 grid grid-cols-3 gap-1.5">
            {[
              { label: "רשומים", value: profiles.length,                                       color: "bg-white/10" },
              { label: "מכבסות", value: profiles.filter(p => p.role === "laundry").length,     color: "bg-cyan-400/20" },
              { label: "ממתינים",value: profiles.filter(p => p.status === "pending_approval").length, color: "bg-rose-400/20" },
            ].map((stat, idx) => (
              <div key={idx} className={`${stat.color} rounded-xl p-2 text-center`}>
                <p className="text-white font-black text-base leading-none">{stat.value}</p>
                <p className="text-[9px] font-semibold mt-0.5" style={{ color: "var(--sidebar-muted)" }}>{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto py-2 space-y-0.5">
            <p className="section-heading">ניהול</p>
            {adminNavItems.map(item => (
              <button
                key={item.key}
                onClick={() => { setActiveTab(item.key); setSearchQuery(""); setSidebarOpen(false); }}
                className={`sidebar-nav-item w-full text-right${activeTab === item.key ? " active" : ""}`}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="flex-1 text-right">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-black flex items-center justify-center"
                    style={{ background: "rgba(239,68,68,0.85)", color: "#fff" }}>
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </button>
            ))}

            <div className="my-3 mx-5 border-t border-white/10" />
            <p className="section-heading">כלים</p>

            <button
              onClick={() => { navigate({ to: "/admin-chat" }); setSidebarOpen(false); }}
              className="sidebar-nav-item w-full text-right"
            >
              <span className="nav-icon"><MessageSquareText className="size-4" /></span>
              <span className="flex-1 text-right">צ'אט תמיכה</span>
              {unreadChatCount > 0 && (
                <span className="min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-black flex items-center justify-center"
                  style={{ background: "rgba(239,68,68,0.85)", color: "#fff" }}>
                  {unreadChatCount > 99 ? "99+" : unreadChatCount}
                </span>
              )}
            </button>
          </nav>

          {/* Footer logout */}
          <div className="p-4 border-t border-white/10">
            <button
              onClick={() => { logout(); window.location.href = "/login"; }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-right"
              style={{ color: "var(--sidebar-muted)", background: "transparent" }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.15)"; (e.currentTarget as HTMLButtonElement).style.color = "#fca5a5"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "var(--sidebar-muted)"; }}
            >
              <span className="size-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.08)" }}>
                <LogOut className="size-4" />
              </span>
              <span className="text-sm font-bold">התנתק</span>
            </button>
          </div>
        </aside>

        {/* ═══════════════════════════════════════════════════════════════
            MAIN CONTENT
        ════════════════════════════════════════════════════════════════ */}
        <main className="dashboard-main min-h-screen" style={{ background: "var(--dashboard-bg)" }}>

          {/* Top-bar */}
          <div className="sticky top-0 z-30 bg-white/80 border-b border-purple-100/60 backdrop-blur-md px-6 py-3.5 flex items-center justify-between gap-4"
            style={{ boxShadow: "0 1px 8px rgba(107,29,92,0.07)" }}>
            <div className="w-10 md:hidden shrink-0" />
            <div className="flex-1 min-w-0 text-right">
              <h1 className="text-base font-black text-foreground">
                {activeTab === "users"     && "ניהול משתמשים"}
                {activeTab === "laundries" && "ניהול מכבסות"}
                {activeTab === "orders"    && "הזמנות גלובליות"}
                {activeTab === "pricing"   && "מחירונים גלובליים"}
                {activeTab === "messages"  && "לוח הודעות"}
              </h1>
              <p className="text-[11px] text-muted-foreground font-semibold">
                {activeTab === "users"     && `${filteredProfiles.filter(p => p.role !== "laundry").length} משתמשים רשומים`}
                {activeTab === "laundries" && `${filteredLaundries.length} מכבסות רשומות`}
                {activeTab === "orders"    && `${filteredOrders.length} הזמנות בסינון הנוכחי`}
                {activeTab === "pricing"   && "עריכת מחירי שירותים גלובלית"}
                {activeTab === "messages"  && "שלח הודעות מתוקשרות לקהל יעד"}
              </p>
            </div>
            {/* Chat shortcut + LIVE */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => navigate({ to: "/admin-chat" })}
                className="relative size-9 rounded-xl bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground flex items-center justify-center transition"
                title="לוח הודעות"
              >
                <MessageSquareText className="size-4" />
                {unreadChatCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center shadow">
                    {unreadChatCount > 99 ? "99+" : unreadChatCount}
                  </span>
                )}
              </button>
              <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-black text-emerald-700">LIVE</span>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-6 space-y-5 max-w-full">

            {/* ════════ TAB: PRICING ════════════════════════════════════ */}
            {activeTab === "pricing" && (
              <div className="dash-card overflow-hidden">
                <div className="px-5 py-4 border-b border-purple-50">
                  <h2 className="text-sm font-black text-foreground">מחירון שירותים גלובלי</h2>
                  <p className="text-[11px] text-muted-foreground mt-0.5">הגדרת מחירי ברירת מחדל לכל המכבסות</p>
                </div>
                <div className="p-5">
                  <AdminPricingPanel
                    laundries={profiles
                      .filter(p => p.role === "laundry")
                      .map(p => ({ id: p.id, name: p.businessName || p.fullName || p.email }))}
                  />
                </div>
              </div>
            )}

            {/* ════════ TAB: USERS ══════════════════════════════════════ */}
            {activeTab === "users" && (
              <div className="space-y-4">
                {/* Search + filters */}
                <div className="dash-card p-4 space-y-3">
                  <div className="relative">
                    <input
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="חפש לפי שם, אימייל..."
                      className="w-full h-10 pr-10 pl-4 rounded-xl border border-purple-200/60 bg-background text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary text-right"
                      style={{ boxShadow: "var(--card-shadow)" }}
                    />
                    <Search className="absolute right-3.5 top-3 size-4 text-muted-foreground" />
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { key: "all",      label: "הכל" },
                      { key: "customer", label: "לקוחות" },
                      { key: "admin",    label: "מנהלים" },
                    ].map(f => (
                      <button
                        key={f.key}
                        onClick={() => setRoleFilter(f.key)}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all border active:scale-95 ${
                          roleFilter === f.key
                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                            : "bg-white text-muted-foreground border-purple-100/60 hover:text-foreground"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* User list */}
                <div className="dash-card overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-purple-50 flex items-center gap-2">
                    <h2 className="text-sm font-black text-foreground">רשימת משתמשים</h2>
                    <span className="min-w-[22px] h-[22px] rounded-full bg-primary/10 text-primary text-[10px] font-black flex items-center justify-center px-1.5">
                      {filteredProfiles.filter(p => p.role !== "laundry").length}
                    </span>
                  </div>

                  {isLoading ? (
                    <div className="py-16 flex flex-col items-center gap-3">
                      <div className="animate-spin rounded-full size-8 border-4 border-primary border-t-transparent" />
                      <span className="text-xs text-muted-foreground font-semibold">טוען משתמשים...</span>
                    </div>
                  ) : filteredProfiles.filter(p => p.role !== "laundry").length === 0 ? (
                    <div className="p-12 text-center text-xs text-muted-foreground">לא נמצאו משתמשים התואמים את הסינון.</div>
                  ) : (
                    <div className="divide-y divide-purple-50/60">
                      {filteredProfiles.filter(p => p.role !== "laundry").map(profile => (
                        <div key={profile.id} className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-purple-50/20 transition-colors">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="size-10 shrink-0 rounded-xl bg-lavender text-primary font-black text-base flex items-center justify-center">
                              {(profile.fullName || "?")[0].toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-extrabold text-foreground text-xs truncate">{profile.fullName || "משתמש ללא שם"}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{profile.email}</p>
                              <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${getRoleBadge(profile.role)}`}>
                                {getRoleLabel(profile.role)}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => openEditModal(profile)}
                              className="size-9 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 flex items-center justify-center transition active:scale-95"
                              title="ערוך פרופיל"
                            >
                              <Edit2 className="size-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteProfile(profile.id, profile.email)}
                              className="size-9 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 flex items-center justify-center transition active:scale-95"
                              title="מחק משתמש"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {hasMoreProfiles && (
                    <div className="px-5 pb-4 pt-2 flex justify-center">
                      <button
                        onClick={() => fetchProfiles(false)}
                        disabled={loadingMoreProfiles}
                        className="px-6 py-2.5 rounded-full text-xs font-bold bg-white text-primary border border-primary/20 hover:bg-primary/5 transition disabled:opacity-50 active:scale-95 shadow-sm"
                      >
                        {loadingMoreProfiles ? (
                          <span className="flex items-center gap-2"><Loader2 className="size-3.5 animate-spin" /> טוען...</span>
                        ) : "טען עוד משתמשים"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ════════ TAB: LAUNDRIES ══════════════════════════════════ */}
            {activeTab === "laundries" && (
              <div className="space-y-4">
                {/* Search */}
                <div className="dash-card p-4">
                  <div className="relative">
                    <input
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="חפש מכבסה לפי שם עסק או אימייל..."
                      className="w-full h-10 pr-10 pl-4 rounded-xl border border-purple-200/60 bg-background text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary text-right"
                      style={{ boxShadow: "var(--card-shadow)" }}
                    />
                    <Search className="absolute right-3.5 top-3 size-4 text-muted-foreground" />
                  </div>
                </div>

                {/* Status summary pills */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "פעילות",          count: profiles.filter(p => p.role === "laundry" && p.status === "approved").length,          color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
                    { label: "ממתינות לאישור",  count: profiles.filter(p => p.role === "laundry" && p.status === "pending_approval").length,   color: "bg-amber-50 border-amber-200 text-amber-700"    },
                    { label: "מושעות",          count: profiles.filter(p => p.role === "laundry" && p.status === "suspended").length,          color: "bg-red-50 border-red-200 text-red-600"          },
                  ].map((s, idx) => (
                    <div key={idx} className={`stat-pill border ${s.color}`}>
                      <span className="text-xl font-black leading-none">{s.count}</span>
                      <span className="text-[10px] font-bold opacity-80">{s.label}</span>
                    </div>
                  ))}
                </div>

                {/* Laundries list */}
                <div className="dash-card overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-purple-50 flex items-center gap-2">
                    <h2 className="text-sm font-black text-foreground">מכבסות רשומות</h2>
                    <span className="min-w-[22px] h-[22px] rounded-full bg-cyan-100 text-cyan-700 text-[10px] font-black flex items-center justify-center px-1.5">
                      {filteredLaundries.length}
                    </span>
                  </div>

                  {isLoading ? (
                    <div className="py-16 flex flex-col items-center gap-3">
                      <div className="animate-spin rounded-full size-8 border-4 border-primary border-t-transparent" />
                      <span className="text-xs text-muted-foreground font-semibold">טוען מכבסות...</span>
                    </div>
                  ) : filteredLaundries.length === 0 ? (
                    <div className="p-12 text-center text-xs text-muted-foreground">לא נמצאו מכבסות התואמות את החיפוש.</div>
                  ) : (
                    <div className="divide-y divide-purple-50/60">
                      {filteredLaundries.map(profile => (
                        <div key={profile.id} className="px-5 py-4 flex items-center justify-between gap-3 hover:bg-purple-50/20 transition-colors">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="size-11 shrink-0 rounded-xl bg-cyan-100 text-cyan-700 font-black text-lg flex items-center justify-center">
                              {(profile.businessName || profile.fullName || "?")[0].toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-extrabold text-foreground text-sm truncate">{profile.businessName || "מכבסה ללא שם"}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                                {profile.shopSlug ? `/shop/${profile.shopSlug}` : "טרם הוגדר קישור"}
                              </p>
                              <p className="text-[9px] text-muted-foreground truncate">{profile.fullName} · {profile.email}</p>
                              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${getRoleBadge(profile.role)}`}>
                                  {getRoleLabel(profile.role)}
                                </span>
                                {profile.status === "pending_approval" && (
                                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-700 border border-amber-200">⏳ ממתין לאישור</span>
                                )}
                                {profile.status === "approved" && (
                                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">✅ פעיל</span>
                                )}
                                {profile.status === "suspended" && (
                                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-red-100 text-red-700 border border-red-200">❌ מושעה</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => openLaundrySettingsModal(profile)}
                              className="h-9 px-3 rounded-xl bg-cyan-600 text-white hover:bg-cyan-700 flex items-center justify-center gap-1.5 text-[11px] font-extrabold transition active:scale-95 shadow-sm"
                            >
                              <Settings className="size-3.5" />
                              <span className="hidden sm:inline">ניהול שירותים</span>
                            </button>
                            <button
                              onClick={() => openEditModal(profile)}
                              title="ערוך מכבסה" className="size-9 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 flex items-center justify-center transition active:scale-95"
                            >
                              <Edit2 className="size-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteProfile(profile.id, profile.email)}
                              className="size-9 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 flex items-center justify-center transition active:scale-95"
                              title="מחק מכבסה"
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

            {/* ════════ TAB: ORDERS ═════════════════════════════════════ */}
            {activeTab === "orders" && (
              <div className="space-y-4">
                {/* Filters card */}
                <div className="dash-card p-4 space-y-3">
                  <h3 className="text-xs font-black text-primary uppercase tracking-widest">חיפוש וסינון הזמנות</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="relative">
                      <input
                        value={orderSearchQuery}
                        onChange={e => setOrderSearchQuery(e.target.value)}
                        placeholder="חפש לפי מזהה או אימייל..."
                        className="w-full h-10 pr-9 pl-4 rounded-xl border border-purple-200/60 bg-background text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary text-right"
                        style={{ boxShadow: "var(--card-shadow)" }}
                      />
                      <Search className="absolute right-3 top-3 size-4 text-muted-foreground" />
                    </div>

                    <select
                      value={orderStatusFilter}
                      onChange={e => setOrderStatusFilter(e.target.value)}
                      className="h-10 w-full px-3 rounded-xl border border-purple-200/60 bg-background text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary text-right"
                      dir="rtl"
                    >
                      <option value="all">כל הסטטוסים</option>
                      <option value="pending">⏳ ממתין</option>
                      <option value="accepted">🔵 התקבל</option>
                      <option value="collected">🟡 נאסף</option>
                      <option value="ready">🟢 מוכן</option>
                      <option value="delivered">✅ נמסר</option>
                      <option value="cancelled">❌ בוטלה</option>
                    </select>

                    <select
                      value={orderLaundryFilter}
                      onChange={e => setOrderLaundryFilter(e.target.value)}
                      className="h-10 w-full px-3 rounded-xl border border-purple-200/60 bg-background text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary text-right"
                      dir="rtl"
                    >
                      <option value="all">כל המכבסות</option>
                      <option value="unassigned">ללא שיוך / עצמאי</option>
                      {profiles.filter(p => p.role === "laundry").map(vendor => (
                        <option key={vendor.id} value={vendor.id}>{vendor.businessName || vendor.fullName}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Orders grouped by vendor */}
                {ordersLoading ? (
                  <div className="py-16 flex flex-col items-center gap-3">
                    <div className="animate-spin rounded-full size-8 border-4 border-primary border-t-transparent" />
                    <span className="text-xs text-muted-foreground font-semibold">טוען הזמנות מהמערכת...</span>
                  </div>
                ) : filteredOrders.length === 0 ? (
                  <div className="dash-card p-12 text-center">
                    <p className="text-3xl mb-3">📦</p>
                    <p className="text-sm font-bold text-muted-foreground">לא נמצאו הזמנות העונות לסינון.</p>
                  </div>
                ) : (
                  (() => {
                    const vendors = profiles.filter(p => p.role === "laundry");
                    const unassignedOrders = filteredOrders.filter(o => !o.laundryId || !vendors.some(v => v.id === o.laundryId));

                    return (
                      <div className="space-y-5 pb-6">
                        {vendors.map(vendor => {
                          const vendorOrders = filteredOrders.filter(o => o.laundryId === vendor.id);
                          if (vendorOrders.length === 0) return null;
                          return (
                            <div key={vendor.id} className="dash-card overflow-hidden">
                              <div className="px-5 py-3.5 border-b border-purple-50 flex items-center gap-2">
                                <Building2 className="size-4 text-cyan-600 shrink-0" />
                                <h3 className="text-sm font-black text-cyan-800">
                                  {vendor.businessName || vendor.fullName}
                                </h3>
                                <span className="min-w-[22px] h-[22px] rounded-full bg-cyan-100 text-cyan-700 text-[10px] font-black flex items-center justify-center px-1.5 mr-auto">
                                  {vendorOrders.length}
                                </span>
                              </div>
                              <div className="divide-y divide-purple-50/40 p-2 space-y-1.5">
                                {vendorOrders.map(order => renderOrderCard(order))}
                              </div>
                            </div>
                          );
                        })}

                        {unassignedOrders.length > 0 && (
                          <div className="dash-card overflow-hidden" style={{ borderColor: "rgba(148,163,184,0.3)" }}>
                            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-2">
                              <XCircle className="size-4 text-slate-400 shrink-0" />
                              <h3 className="text-sm font-black text-slate-600">עצמאיות / ללא שיוך</h3>
                              <span className="min-w-[22px] h-[22px] rounded-full bg-slate-100 text-slate-600 text-[10px] font-black flex items-center justify-center px-1.5 mr-auto">
                                {unassignedOrders.length}
                              </span>
                            </div>
                            <div className="divide-y divide-slate-50 p-2 space-y-1.5">
                              {unassignedOrders.map(order => renderOrderCard(order))}
                            </div>
                          </div>
                        )}

                        {hasMoreHistorical && (
                          <div className="flex justify-center">
                            <button
                              onClick={() => fetchHistoricalOrders(false)}
                              disabled={loadingMoreHistorical}
                              className="px-6 py-2.5 rounded-full text-xs font-bold bg-white text-primary border border-primary/20 hover:bg-primary/5 transition disabled:opacity-50 active:scale-95 shadow-sm"
                            >
                              {loadingMoreHistorical
                                ? <span className="flex items-center gap-2"><Loader2 className="size-3.5 animate-spin" /> טוען...</span>
                                : "טען עוד הזמנות"}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()
                )}
              </div>
            )}

            {/* ════════ TAB: MESSAGES ═══════════════════════════════════ */}
            {activeTab === "messages" && (
              <div className="space-y-5 max-w-2xl mx-auto">
                {/* Header card */}
                <div className="dash-card p-5 space-y-1">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <MessageSquareText className="size-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-sm font-black text-foreground">שליחת הודעה מתוקשרת</h2>
                      <p className="text-[11px] text-muted-foreground">שלח התראות ישירות לנמענים נבחרים במערכת</p>
                    </div>
                  </div>
                </div>

                {/* Message form */}
                <div className="dash-card p-5 space-y-5">
                  {/* Subject */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-foreground block">נושא ההודעה</label>
                    <input
                      value={msgSubject}
                      onChange={e => setMsgSubject(e.target.value)}
                      placeholder="הזן נושא ההודעה..."
                      className="w-full h-11 px-4 rounded-xl border border-purple-200/60 bg-background text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary text-right"
                      style={{ boxShadow: "var(--card-shadow)" }}
                    />
                  </div>

                  {/* Content */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-foreground block">תוכן ההודעה</label>
                    <textarea
                      value={msgContent}
                      onChange={e => setMsgContent(e.target.value)}
                      placeholder="כתוב את תוכן ההודעה כאן..."
                      rows={5}
                      className="w-full px-4 py-3 rounded-xl border border-purple-200/60 bg-background text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary text-right resize-none"
                      style={{ boxShadow: "var(--card-shadow)" }}
                    />
                  </div>

                  {/* Audience selector */}
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-foreground block">קהל יעד</label>
                    <div className="space-y-2.5">
                      {([
                        { value: "all" as const,             label: "שליחה לכלל המשתמשים במערכת",            desc: `${profiles.length} משתמשים (לקוחות, מכבסות, מנהלים)`, icon: "👥" },
                        { value: "laundries" as const,        label: "שליחה לכלל המכבסות בלבד",               desc: `${profiles.filter(p => p.role === "laundry").length} מכבסות רשומות`, icon: "🧺" },
                        { value: "specific_laundry" as const, label: "שליחה לכל הלקוחות של מכבסה מסוימת",   desc: "בחר מכבסה ספציפית להגיע ללקוחותיה", icon: "🎯" },
                      ] as const).map(opt => (
                        <label
                          key={opt.value}
                          className={`flex items-start gap-3 p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
                            msgAudience === opt.value
                              ? "border-primary bg-primary/5 shadow-sm"
                              : "border-muted-foreground/15 bg-background hover:border-primary/30"
                          }`}
                        >
                          <input
                            type="radio"
                            name="msgAudience"
                            value={opt.value}
                            checked={msgAudience === opt.value}
                            onChange={() => setMsgAudience(opt.value)}
                            className="mt-0.5 accent-primary shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span>{opt.icon}</span>
                              <span className="text-xs font-extrabold text-foreground">{opt.label}</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{opt.desc}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Specific laundry picker */}
                  {msgAudience === "specific_laundry" && (
                    <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                      <label className="text-xs font-bold text-foreground block">בחר מכבסה</label>
                      <select
                        value={msgTargetLaundryId}
                        onChange={e => setMsgTargetLaundryId(e.target.value)}
                        className="w-full h-11 px-3 rounded-xl border border-purple-200/60 bg-background text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary text-right"
                        dir="rtl"
                      >
                        <option value="">-- בחר מכבסה --</option>
                        {profiles.filter(p => p.role === "laundry").map(v => (
                          <option key={v.id} value={v.id}>
                            {v.businessName || v.fullName || v.email}
                          </option>
                        ))}
                      </select>
                      {msgTargetLaundryId && (
                        <p className="text-[10px] text-muted-foreground">
                          יישלח לכל לקוחות מכבסה זו שביצעו לפחות הזמנה אחת
                        </p>
                      )}
                    </div>
                  )}

                  {/* Send button */}
                  <button
                    onClick={handleSendMessage}
                    disabled={isSendingMsg || !msgSubject.trim() || !msgContent.trim()}
                    className="w-full h-12 rounded-2xl bg-primary text-primary-foreground font-black text-sm flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:opacity-90"
                  >
                    {isSendingMsg ? (
                      <><Loader2 className="size-4 animate-spin" /> שולח...</>
                    ) : (
                      <><MessageSquareText className="size-4" /> שלח הודעה</>
                    )}
                  </button>
                </div>

                {/* Info card */}
                <div className="dash-card p-4 bg-amber-50/60 border border-amber-200/60">
                  <div className="flex items-start gap-2.5 text-right">
                    <span className="text-lg">💡</span>
                    <div>
                      <p className="text-xs font-bold text-amber-800">כיצד פועל מנגנון ההודעות?</p>
                      <p className="text-[10px] text-amber-700 mt-1 leading-relaxed">
                        ההודעות נשמרות כ-notifications בפיירסטור וניתן לראותן בתוך האפליקציה.
                        בחר את קהל היעד המתאים, מלא נושא ותוכן, ולחץ שלח.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </main>
      </div>

      {/* ── Dialog 1: User Edit Modal ──────────────────────────────────────── */}
      <Dialog open={editingProfile !== null} onOpenChange={open => !open && setEditingProfile(null)}>
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
              <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="שם מלא" className="text-right" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground block">אימייל</label>
              <Input value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="אימייל" className="text-right text-left"
                disabled={editingProfile?.role === "admin"} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground block">תפקיד / הרשאה</label>
              <select
                value={editRole} onChange={e => setEditRole(e.target.value as any)}
                className="w-full h-11 px-3 rounded-xl border border-muted-foreground/20 bg-background text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary text-right appearance-none"
                disabled={editingProfile?.role === "admin"} dir="rtl"
              >
                <option value="customer">לקוח (Customer)</option>
                <option value="laundry">צוות מכבסה (Laundry)</option>
                <option value="admin">מנהל מערכת (Admin)</option>
              </select>
            </div>
            {editRole === "laundry" && (
              <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-200">
                <label className="text-xs font-bold text-foreground block">סטטוס אישור</label>
                <select value={editStatus} onChange={e => setEditStatus(e.target.value as any)}
                  className="w-full h-11 px-3 rounded-xl border border-muted-foreground/20 bg-background text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary text-right appearance-none" dir="rtl">
                  <option value="pending_setup">🛠️ בהקמה (Pending Setup)</option>
                  <option value="pending_approval">⏳ ממתין לאישור (Pending)</option>
                  <option value="approved">✅ מאושר (Approved)</option>
                  <option value="suspended">❌ מושעה (Suspended)</option>
                </select>
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-2">
            <button onClick={handleUpdateProfile} disabled={isUpdating}
              className="flex-1 h-11 sm:h-12 rounded-2xl bg-primary text-primary-foreground text-sm sm:text-base font-bold active:scale-95 transition flex items-center justify-center disabled:opacity-50 min-h-[44px]">
              {isUpdating ? "מעדכן..." : "שמור שינויים"}
            </button>
            <button onClick={() => setEditingProfile(null)}
              className="h-11 sm:h-12 px-4 sm:px-5 rounded-2xl border border-muted-foreground/20 text-sm sm:text-base font-bold active:scale-95 transition min-h-[44px]">
              ביטול
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog 2: Laundry Services CRUD Modal ─────────────────────────── */}
      <Dialog open={selectedLaundry !== null} onOpenChange={open => !open && setSelectedLaundry(null)}>
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
            {/* Tab navigation within modal */}
            <div className="flex gap-2 border-b border-muted-foreground/10 pb-2">
              {[
                { key: "details" as const, label: "פרטי עסק" },
                { key: "addons"  as const, label: `שירותים ותוספות (${laundryAddons.length})` },
                { key: "tiers"   as const, label: `רמות משלוח (${laundryTiers.length})` },
              ].map(t => (
                <button key={t.key} onClick={() => setLaundryModalTab(t.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    laundryModalTab === t.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* TAB: details */}
            {laundryModalTab === "details" && (
              <div className="space-y-4">
                {[
                  { label: "שם עסק במערכת",   value: editBusinessName, setter: setEditBusinessName, placeholder: "שם עסק",   cls: "text-right" },
                  { label: "קישור ייחודי (Slug)", value: editShopSlug,    setter: setEditShopSlug,    placeholder: "slug",      cls: "text-right text-left font-mono text-xs" },
                  { label: "שם איש קשר",      value: editFullName,     setter: setEditFullName,     placeholder: "שם מלא",    cls: "text-right" },
                ].map(field => (
                  <div key={field.label} className="space-y-1.5">
                    <label className="text-xs font-bold text-foreground block">{field.label}</label>
                    <Input value={field.value} onChange={e => field.setter(e.target.value)} placeholder={field.placeholder} className={field.cls} />
                  </div>
                ))}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground block">אימייל מכבסה</label>
                  <Input value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="אימייל" className="text-right text-left" disabled />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground block">סטטוס אישור</label>
                  <select value={editStatus} onChange={e => setEditStatus(e.target.value as any)}
                    className="w-full h-11 px-3 rounded-xl border border-muted-foreground/20 bg-background text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary text-right" dir="rtl">
                    <option value="pending_setup">🛠️ בהקמה</option>
                    <option value="pending_approval">⏳ ממתין לאישור</option>
                    <option value="approved">✅ מאושר ופעיל</option>
                    <option value="suspended">❌ מושעה</option>
                  </select>
                </div>
                <button onClick={handleUpdateLaundryDetails}
                  className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-bold active:scale-95 transition mt-2">
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
                    <button onClick={handleSeedDefaults} disabled={isSeeding}
                      className="px-3 py-1 rounded-lg bg-amber-500 text-white text-xs font-extrabold flex items-center gap-1 active:scale-95 transition">
                      {isSeeding ? "טוען..." : "טען ברירת מחדל"}
                    </button>
                  )}
                </div>

                {showAddonForm && (
                  <div className="p-3 border border-muted-foreground/15 bg-muted/20 rounded-2xl space-y-3">
                    <h4 className="text-xs font-black text-primary">{editingAddonId ? "עריכת שירות/תוספת" : "הוספת שירות/תוספת חדשה"}</h4>
                    <div className="space-y-2">
                      {[
                        { label: "שם השירות",      val: addonForm.label, set: (v: string) => setAddonForm(p => ({ ...p, label: v })), placeholder: "למשל: אקסטרה ריח", type: "text" },
                        { label: "תוספת מחיר (₪)", val: String(addonForm.price || ""), set: (v: string) => setAddonForm(p => ({ ...p, price: Number(v) })), placeholder: "0", type: "number" },
                        { label: "תיאור השירות",   val: addonForm.desc,  set: (v: string) => setAddonForm(p => ({ ...p, desc: v })), placeholder: "תיאור קצר", type: "text" },
                      ].map(f => (
                        <div key={f.label} className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground block">{f.label}</label>
                          <Input type={f.type} value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} className="text-right text-xs" />
                        </div>
                      ))}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground block">קבוצה / קטגוריה</label>
                        <select value={addonForm.group} onChange={e => setAddonForm(p => ({ ...p, group: e.target.value }))}
                          className="w-full h-9 px-2 rounded-lg border border-muted-foreground/10 bg-background text-xs">
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
                    onClick={() => { setAddonForm({ label: "", price: 0, desc: "", group: "שדרוגי פרימיום" }); setEditingAddonId(null); setShowAddonForm(true); }}
                    className="w-full py-2 border-2 border-dashed border-primary/20 hover:border-primary text-primary text-xs font-bold rounded-xl flex items-center justify-center gap-1 transition">
                    <PlusCircle className="size-3.5" /><span>הוסף שירות/תוספת מותאמת</span>
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
                          <button onClick={() => { setAddonForm({ label: addon.label, price: addon.price, desc: addon.desc || "", group: addon.group || "שדרוגי פרימיום" }); setEditingAddonId(addon.id); setShowAddonForm(true); }}
                            className="p-1 text-primary hover:bg-primary/10 rounded-md"><Edit2 className="size-3.5" /></button>
                          <button onClick={() => handleDeleteAddon(addon.id)} className="p-1 text-destructive hover:bg-destructive/10 rounded-md"><Trash2 className="size-3.5" /></button>
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
                    <button onClick={handleSeedDefaults} disabled={isSeeding}
                      className="px-3 py-1 rounded-lg bg-amber-500 text-white text-xs font-extrabold flex items-center gap-1 active:scale-95 transition">
                      {isSeeding ? "טוען..." : "טען ברירת מחדל"}
                    </button>
                  )}
                </div>

                {showTierForm && (
                  <div className="p-3 border border-muted-foreground/15 bg-muted/20 rounded-2xl space-y-3">
                    <h4 className="text-xs font-black text-primary">{editingTierId ? "עריכת רמת משלוח" : "הוספת רמת משלוח חדשה"}</h4>
                    <div className="space-y-2">
                      {[
                        { label: "שם רמת משלוח",  val: tierForm.label, set: (v: string) => setTierForm(p => ({ ...p, label: v })), placeholder: "למשל: משלוח אקספרס", type: "text" },
                        { label: "תוספת מחיר (₪)",val: String(tierForm.price || ""), set: (v: string) => setTierForm(p => ({ ...p, price: Number(v) })), placeholder: "0", type: "number" },
                        { label: "תיאור וזמני הגעה",val: tierForm.desc, set: (v: string) => setTierForm(p => ({ ...p, desc: v })), placeholder: "למשל: איסוף תוך 24 שעות", type: "text" },
                      ].map(f => (
                        <div key={f.label} className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground block">{f.label}</label>
                          <Input type={f.type} value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} className="text-right text-xs" />
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={handleSaveTier} className="flex-1 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold">שמור רמת משלוח</button>
                      <button onClick={() => { setShowTierForm(false); setEditingTierId(null); }} className="px-3 py-1.5 border border-muted-foreground/20 rounded-lg text-xs">ביטול</button>
                    </div>
                  </div>
                )}

                {!showTierForm && (
                  <button
                    onClick={() => { setTierForm({ label: "", price: 0, desc: "" }); setEditingTierId(null); setShowTierForm(true); }}
                    className="w-full py-2 border-2 border-dashed border-primary/20 hover:border-primary text-primary text-xs font-bold rounded-xl flex items-center justify-center gap-1 transition">
                    <PlusCircle className="size-3.5" /><span>הוסף רמת משלוח/תמחור</span>
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
                          <button onClick={() => { setTierForm({ label: tier.label, price: tier.price, desc: tier.desc || "" }); setEditingTierId(tier.id); setShowTierForm(true); }}
                            className="p-1 text-primary hover:bg-primary/10 rounded-md"><Edit2 className="size-3.5" /></button>
                          <button onClick={() => handleDeleteTier(tier.id)} className="p-1 text-destructive hover:bg-destructive/10 rounded-md"><Trash2 className="size-3.5" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end mt-4 pt-3 border-t border-muted-foreground/5">
            <button onClick={() => setSelectedLaundry(null)}
              className="h-11 px-6 rounded-2xl bg-muted text-foreground text-sm font-bold active:scale-95 transition">
              סגור חלון
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
