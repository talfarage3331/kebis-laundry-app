import { useState, useEffect, useRef } from "react";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useLaundry } from "@/lib/laundry-store";
import { useLaundryOptions, seedDefaultsIfEmpty } from "@/hooks/use-laundry-options";
import { generateSlug } from "@/lib/slug";
import {
  Plus,
  Edit2,
  Trash2,
  Check,
  Sparkles,
  Truck,
  Loader2,
  RefreshCw,
  Link,
  Copy,
  Palette,
  ImagePlus,
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

interface AddonFormState {
  label: string;
  price: number;
  desc: string;
  group: string;
}

interface TierFormState {
  label: string;
  price: number;
  desc: string;
}

const EMPTY_ADDON_FORM: AddonFormState = {
  label: "",
  price: 0,
  desc: "",
  group: "שדרוגי פרימיום",
};

const EMPTY_TIER_FORM: TierFormState = {
  label: "",
  price: 0,
  desc: "",
};

export function LaundrySettingsCRUDPanel() {
  const { user } = useLaundry();
  const laundryId = user?.uid || "";

  const [activeSubTab, setActiveSubTab] = useState<"addons" | "tiers">("addons");
  const [addons, setAddons] = useState<any[]>([]);
  const [tiers, setTiers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Shareable link state ────────────────────────────────────────────
  const [shopSlug, setShopSlug] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── Brand Identity state ────────────────────────────────────────────
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [brandColor, setBrandColor] = useState<string>("#6B1D5C");
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isSavingColor, setIsSavingColor]     = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load shopSlug + brand fields from the logged-in user's Firestore doc
  useEffect(() => {
    if (!laundryId) return;
    const fetchProfile = async () => {
      try {
        const docSnap = await getDoc(doc(db, "users", laundryId));
        if (docSnap.exists()) {
          const data = docSnap.data();
          setShopSlug(data.shopSlug || null);
          setLogoUrl(data.logoUrl || null);
          if (data.brandColor) setBrandColor(data.brandColor);
        }
      } catch (err) {
        console.warn("[LaundrySettingsCRUDPanel] could not load profile:", err);
      }
    };
    fetchProfile();
  }, [laundryId]);

  /** Generate a unique slug from the user's name and persist it */
  const handleGenerateSlug = async () => {
    if (!laundryId || !user?.name) return;
    setIsGenerating(true);
    try {
      const base = generateSlug(user.name);
      const candidate = base || `shop-${laundryId.slice(0, 6)}`;
      await updateDoc(doc(db, "users", laundryId), { shopSlug: candidate });
      setShopSlug(candidate);
      toast.success("קישור החנות נוצר בהצלחה!");
    } catch (err: any) {
      toast.error("שגיאה ביצירת הקישור: " + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  /** Copy the shop URL to clipboard */
  const handleCopyLink = async () => {
    if (!shopSlug) return;
    const url = `${window.location.origin}/shop/${shopSlug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("הקישור הועתק ללוח!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("שגיאה בהעתקת הקישור");
    }
  };

  /**
   * Convert selected image to Base64 via FileReader and save directly to
   * Firestore under users/{laundryId}.logoUrl.
   *
   * Max 500 KB — keeps Firestore documents lightweight and avoids Firebase
   * Storage CORS issues entirely.
   */
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so the same file can be re-selected after an error
    e.target.value = "";
    if (!file || !laundryId) return;

    if (!file.type.startsWith("image/")) {
      toast.error("יש לבחור קובץ תמונה בלבד");
      return;
    }
    // 500 KB limit keeps Firestore doc size manageable
    if (file.size > 500 * 1024) {
      toast.error("הקובץ גדול מדי — מקסימום 500 קילובייט. דחס את התמונה לפני ההעלאה.");
      return;
    }

    setIsUploadingLogo(true);
    const reader = new FileReader();

    reader.onerror = () => {
      toast.error("שגיאה בקריאת הקובץ");
      setIsUploadingLogo(false);
    };

    reader.onload = async () => {
      const base64 = reader.result as string; // data:<mime>;base64,<data>
      try {
        await updateDoc(doc(db, "users", laundryId), { logoUrl: base64 });
        setLogoUrl(base64);
        // Bust the use-brand localStorage cache so next visit picks up the new logo
        if (shopSlug) localStorage.removeItem(`brandCache_${shopSlug}`);
        toast.success("הלוגו עודכן בהצלחה!");
      } catch (err: any) {
        toast.error("שגיאה בשמירת הלוגו: " + err.message);
      } finally {
        setIsUploadingLogo(false);
      }
    };

    reader.readAsDataURL(file);
  };

  /** Save chosen brand color to Firestore */
  const handleSaveBrandColor = async () => {
    if (!laundryId) return;
    setIsSavingColor(true);
    try {
      await updateDoc(doc(db, "users", laundryId), { brandColor });
      // Bust cache
      if (shopSlug) localStorage.removeItem(`brandCache_${shopSlug}`);
      toast.success("צבע המיתוג נשמר בהצלחה!");
    } catch (err: any) {
      toast.error("שגיאה בשמירת הצבע: " + err.message);
    } finally {
      setIsSavingColor(false);
    }
  };

  // Dialog States
  const [addonModalOpen, setAddonModalOpen] = useState(false);
  const [editingAddonId, setEditingAddonId] = useState<string | null>(null);
  const [addonForm, setAddonForm] = useState<AddonFormState>(EMPTY_ADDON_FORM);

  const [tierModalOpen, setTierModalOpen] = useState(false);
  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [tierForm, setTierForm] = useState<TierFormState>(EMPTY_TIER_FORM);

  const [isSaving, setIsSaving] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  // Load options for this specific laundry
  useEffect(() => {
    if (!laundryId) return;

    setLoading(true);
    
    // Listen to laundry_addons
    const addonsQuery = query(collection(db, "laundry_addons"), where("laundryId", "==", laundryId));
    const unsubAddons = onSnapshot(addonsQuery, (snapshot) => {
      const list = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      setAddons(list);
    });

    // Listen to laundry_delivery_tiers
    const tiersQuery = query(collection(db, "laundry_delivery_tiers"), where("laundryId", "==", laundryId));
    const unsubTiers = onSnapshot(tiersQuery, (snapshot) => {
      const list = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      setTiers(list);
      setLoading(false);
    });

    return () => {
      unsubAddons();
      unsubTiers();
    };
  }, [laundryId]);

  // Seeding trigger
  const handleSeedDefaults = async () => {
    if (!laundryId) return;
    setIsSeeding(true);
    try {
      await seedDefaultsIfEmpty(laundryId);
      toast.success("אפשרויות ברירת המחדל נטענו בהצלחה!");
    } catch (err: any) {
      toast.error("שגיאה בטעינת ברירות מחדל: " + err.message);
    } finally {
      setIsSeeding(false);
    }
  };

  // Addon CRUD Operations
  const openAddAddon = () => {
    setEditingAddonId(null);
    setAddonForm(EMPTY_ADDON_FORM);
    setAddonModalOpen(true);
  };

  const openEditAddon = (addon: any) => {
    setEditingAddonId(addon.id);
    setAddonForm({
      label: addon.label,
      price: addon.price,
      desc: addon.desc || "",
      group: addon.group || "שדרוגי פרימיום",
    });
    setAddonModalOpen(true);
  };

  const handleSaveAddon = async () => {
    if (!addonForm.label.trim()) {
      toast.error("נא להזין שם לתוספת");
      return;
    }
    if (addonForm.price < 0) {
      toast.error("המחיר אינו יכול להיות שלילי");
      return;
    }

    setIsSaving(true);
    try {
      if (editingAddonId) {
        // Edit existing addon
        await updateDoc(doc(db, "laundry_addons", editingAddonId), {
          label: addonForm.label,
          price: Number(addonForm.price),
          desc: addonForm.desc,
          group: addonForm.group,
          updatedAt: serverTimestamp(),
        });
        toast.success("התוספת עודכנה בהצלחה!");
      } else {
        // Add new addon
        await addDoc(collection(db, "laundry_addons"), {
          laundryId,
          key: "custom_" + Math.random().toString(36).substring(2, 9),
          label: addonForm.label,
          price: Number(addonForm.price),
          desc: addonForm.desc,
          group: addonForm.group,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        toast.success("תוספת חדשה נוספה בהצלחה!");
      }
      setAddonModalOpen(false);
    } catch (err: any) {
      toast.error("שגיאה בשמירת התוספת: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAddon = async (id: string) => {
    if (!confirm("האם אתה בטוח שברצונך למחוק תוספת זו?")) return;
    try {
      await deleteDoc(doc(db, "laundry_addons", id));
      toast.success("התוספת נמחקה בהצלחה");
    } catch (err: any) {
      toast.error("שגיאה במחיקת התוספת: " + err.message);
    }
  };

  // Tier CRUD Operations
  const openAddTier = () => {
    setEditingTierId(null);
    setTierForm(EMPTY_TIER_FORM);
    setTierModalOpen(true);
  };

  const openEditTier = (tier: any) => {
    setEditingTierId(tier.id);
    setTierForm({
      label: tier.label,
      price: tier.price,
      desc: tier.desc || "",
    });
    setTierModalOpen(true);
  };

  const handleSaveTier = async () => {
    if (!tierForm.label.trim()) {
      toast.error("נא להזין שם לאפשרות המשלוח");
      return;
    }
    if (tierForm.price < 0) {
      toast.error("המחיר אינו יכול להיות שלילי");
      return;
    }

    setIsSaving(true);
    try {
      if (editingTierId) {
        // Edit existing tier
        await updateDoc(doc(db, "laundry_delivery_tiers", editingTierId), {
          label: tierForm.label,
          price: Number(tierForm.price),
          desc: tierForm.desc,
          updatedAt: serverTimestamp(),
        });
        toast.success("אפשרות המשלוח עודכנה בהצלחה!");
      } else {
        // Add new tier
        await addDoc(collection(db, "laundry_delivery_tiers"), {
          laundryId,
          key: "custom_" + Math.random().toString(36).substring(2, 9),
          label: tierForm.label,
          price: Number(tierForm.price),
          desc: tierForm.desc,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        toast.success("אפשרות משלוח חדשה נוספה בהצלחה!");
      }
      setTierModalOpen(false);
    } catch (err: any) {
      toast.error("שגיאה בשמירת אפשרות המשלוח: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTier = async (id: string) => {
    if (!confirm("האם אתה בטוח שברצונך למחוק אפשרות משלוח זו?")) return;
    try {
      await deleteDoc(doc(db, "laundry_delivery_tiers", id));
      toast.success("אפשרות המשלוח נמחקה בהצלחה");
    } catch (err: any) {
      toast.error("שגיאה במחיקת אפשרות המשלוח: " + err.message);
    }
  };

  return (
    <div className="bg-card border border-muted-foreground/10 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4 text-right" dir="rtl">

      {/* ──── Brand Identity Card ──────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-purple-50/80 to-fuchsia-50/60 border border-purple-200/60 rounded-2xl p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-full bg-purple-100 grid place-items-center shrink-0">
            <Palette className="size-4 text-purple-600" />
          </div>
          <div>
            <p className="text-sm font-extrabold text-foreground">מיתוג מכבסת</p>
            <p className="text-[10px] text-muted-foreground">לוגו וצבע מיתוג יופיעו בדפי ההתחברות ובתצוגית WhatsApp של הקישור</p>
          </div>
        </div>

        {/* Logo upload */}
        <div className="space-y-2">
          <p className="text-[11px] font-bold text-slate-700">לוגו המכבסה</p>
          <div className="flex items-center gap-3">
            {/* Preview circle */}
            <div className="size-16 rounded-2xl border-2 border-dashed border-purple-200 bg-white flex items-center justify-center overflow-hidden shrink-0">
              {logoUrl ? (
                <img src={logoUrl} alt="לוגו" className="size-full object-cover" />
              ) : (
                <ImagePlus className="size-6 text-purple-300" />
              )}
            </div>

            {/* Upload controls */}
            <div className="flex-1 space-y-1.5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleLogoUpload}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingLogo}
                className="w-full py-2 rounded-xl bg-purple-100 text-purple-700 text-xs font-black flex items-center justify-center gap-1.5 hover:bg-purple-200 transition active:scale-95 disabled:opacity-60"
              >
                {isUploadingLogo ? (
                  <><Loader2 className="size-3.5 animate-spin" /> שומר...</>
                ) : (
                  <><ImagePlus className="size-3.5" /> {logoUrl ? "עדכן לוגו" : "העלאת לוגו"}</>
                )}
              </button>
              <p className="text-[10px] text-muted-foreground">PNG / JPG / WebP עד 500 קילובייט</p>
              {logoUrl && (
                <p className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                  <Check className="size-3" /> לוגו פעיל
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Color picker */}
        <div className="space-y-2">
          <p className="text-[11px] font-bold text-slate-700">צבע מיתוג ראשי</p>
          <div className="flex items-center gap-3">
            {/* Native color input — acts as the picker */}
            <label className="relative shrink-0 cursor-pointer" title="בחר צבע">
              <span
                className="block size-10 rounded-xl border-2 border-white shadow-md transition-transform hover:scale-105 active:scale-95"
                style={{ backgroundColor: brandColor }}
              />
              <input
                type="color"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                className="sr-only"
              />
            </label>

            {/* Hex display */}
            <div className="flex-1 flex items-center gap-2 bg-white border border-purple-100 rounded-xl px-3 py-2">
              <span className="font-mono text-xs font-bold text-foreground flex-1">{brandColor}</span>
              <button
                type="button"
                onClick={handleSaveBrandColor}
                disabled={isSavingColor}
                className="text-[10px] font-black text-purple-700 bg-purple-100 hover:bg-purple-200 px-2.5 py-1 rounded-lg flex items-center gap-1 transition active:scale-95 disabled:opacity-50"
              >
                {isSavingColor ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                שמור
              </button>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">צבע זה ישמש כרקע הכותרת וצבע הכפתור בדפי ההתחברות
          </p>
        </div>
      </div>

      {/* ──── Shareable Link Card ───────────────────────────────────── */}
      <div className="bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-full bg-primary/15 grid place-items-center shrink-0">
            <Link className="size-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-extrabold text-foreground">קישור החנות האישית שלך</p>
            <p className="text-[10px] text-muted-foreground">שתף קישור זה עם לקוחותך — הם יגיעו ישירות לחנות שלך</p>
          </div>
        </div>

        {shopSlug ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 bg-background border border-muted-foreground/20 rounded-xl px-3 py-2 font-mono text-xs text-primary font-bold truncate select-all">
              {window.location.origin}/shop/{shopSlug}
            </div>
            <button
              onClick={handleCopyLink}
              className={`shrink-0 size-9 rounded-xl flex items-center justify-center transition-all active:scale-95 ${
                copied
                  ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                  : "bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-primary-foreground"
              }`}
              title="העתק קישור"
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </button>
          </div>
        ) : (
          <button
            onClick={handleGenerateSlug}
            disabled={isGenerating}
            className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-black flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50"
          >
            {isGenerating ? <Loader2 className="size-3.5 animate-spin" /> : <Link className="size-3.5" />}
            צור קישור לחנות
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-muted-foreground/10 pb-3">
        <div>
          <h2 className="text-base font-extrabold text-foreground flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            הגדרות תוספות ומשלוחים
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">נהל את התוספות ושירותי המשלוח המוצעים ללקוחות הסניף שלך</p>
        </div>

        {addons.length === 0 && tiers.length === 0 && !loading && (
          <button
            onClick={handleSeedDefaults}
            disabled={isSeeding}
            className="text-xs px-3 py-1.5 rounded-xl bg-primary text-primary-foreground font-black flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
          >
            {isSeeding ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            טען ברירת מחדל
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-muted/40 rounded-xl border border-muted-foreground/5">
        <button
          onClick={() => setActiveSubTab("addons")}
          className={`flex-1 py-2 rounded-lg text-xs font-black transition ${
            activeSubTab === "addons"
              ? "bg-background text-primary shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          תוספות ושדרוגים ({addons.length})
        </button>
        <button
          onClick={() => setActiveSubTab("tiers")}
          className={`flex-1 py-2 rounded-lg text-xs font-black transition ${
            activeSubTab === "tiers"
              ? "bg-background text-primary shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          אפשרויות משלוח ({tiers.length})
        </button>
      </div>

      {/* Content List */}
      {loading ? (
        <div className="py-8 flex flex-col items-center gap-1.5">
          <Loader2 className="size-6 text-primary animate-spin" />
          <span className="text-[10px] text-muted-foreground">טוען הגדרות סניף...</span>
        </div>
      ) : activeSubTab === "addons" ? (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-muted-foreground">תוספות כביסה פעילות</span>
            <button
              onClick={openAddAddon}
              className="text-[10px] font-black text-primary hover:text-primary/80 flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-lg"
            >
              <Plus className="size-3" />
              תוספת חדשה
            </button>
          </div>

          {addons.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground border border-dashed rounded-xl">
              לא נמצאו תוספות. לחץ "טען ברירת מחדל" או "תוספת חדשה".
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
              {addons.map((addon) => (
                <div
                  key={addon.id}
                  className="bg-background border border-muted-foreground/10 hover:border-muted-foreground/20 rounded-xl p-3 flex justify-between items-center gap-3 transition-colors"
                >
                  <div className="space-y-0.5 text-right min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-foreground">{addon.label}</span>
                      <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-black">
                        ₪{addon.price}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">{addon.desc || "אין תיאור"}</p>
                    <span className="text-[8px] text-slate-400 font-bold bg-slate-100 px-1.5 py-0.25 rounded">
                      {addon.group}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditAddon(addon)}
                      className="size-7 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition"
                      title="ערוך"
                    >
                      <Edit2 className="size-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteAddon(addon.id)}
                      className="size-7 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 flex items-center justify-center transition"
                      title="מחק"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-muted-foreground">אפשרויות משלוח פעילות</span>
            <button
              onClick={openAddTier}
              className="text-[10px] font-black text-primary hover:text-primary/80 flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-lg"
            >
              <Plus className="size-3" />
              אפשרות משלוח חדשה
            </button>
          </div>

          {tiers.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground border border-dashed rounded-xl">
              לא נמצאו אפשרויות משלוח. לחץ "טען ברירת מחדל" או "אפשרות חדשה".
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
              {tiers.map((tier) => (
                <div
                  key={tier.id}
                  className="bg-background border border-muted-foreground/10 hover:border-muted-foreground/20 rounded-xl p-3 flex justify-between items-center gap-3 transition-colors"
                >
                  <div className="space-y-0.5 text-right min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-foreground">{tier.label}</span>
                      <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-black">
                        ₪{tier.price}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">{tier.desc || "אין תיאור"}</p>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditTier(tier)}
                      className="size-7 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition"
                      title="ערוך"
                    >
                      <Edit2 className="size-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteTier(tier.id)}
                      className="size-7 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 flex items-center justify-center transition"
                      title="מחק"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Addon Form Dialog */}
      <Dialog open={addonModalOpen} onOpenChange={(o) => !o && setAddonModalOpen(false)}>
        <DialogContent className="max-w-md w-[96%] rounded-2xl p-5 text-right dir-rtl bg-background border shadow-lg focus:outline-none" dir="rtl">
          <DialogHeader className="space-y-1 text-right">
            <DialogTitle className="text-base font-extrabold flex items-center gap-2">
              <Sparkles className="size-5 text-primary" />
              {editingAddonId ? "עריכת תוספת כביסה" : "הוספת תוספת כביסה חדשה"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              עדכן את פרטי התוספת והמחיר עבור לקוחותיך
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 mt-4">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700 block">שם התוספת / שדרוג</label>
              <Input
                value={addonForm.label}
                onChange={(e) => setAddonForm(prev => ({ ...prev, label: e.target.value }))}
                placeholder="לדוגמה: אקסטרה ריח יוקרתי"
                className="text-right"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 block">מחיר (₪)</label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={addonForm.price}
                  onChange={(e) => setAddonForm(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                  className="text-right"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 block">קבוצה / קטגוריה</label>
                <select
                  value={addonForm.group}
                  onChange={(e) => setAddonForm(prev => ({ ...prev, group: e.target.value }))}
                  className="w-full h-10 px-3 rounded-xl border border-muted-foreground/20 bg-background text-foreground text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary text-right appearance-none"
                >
                  <option value="שדרוגי פרימיום">שדרוגי פרימיום</option>
                  <option value="סוגי טיפול מיוחדים">סוגי טיפול מיוחדים</option>
                  <option value="חוויית לוגיסטיקה">חוויית לוגיסטיקה</option>
                  <option value="שירותי איסוף עצמי">שירותי איסוף עצמי</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700 block">תיאור קצר (אופציונלי)</label>
              <Input
                value={addonForm.desc}
                onChange={(e) => setAddonForm(prev => ({ ...prev, desc: e.target.value }))}
                placeholder="הסבר קצר ללקוח על שירות זה"
                className="text-right"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddonModalOpen(false)}
                className="text-xs px-4 py-2 min-h-[38px] rounded-xl border border-muted-foreground/20 hover:bg-muted font-bold transition active:scale-95"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={handleSaveAddon}
                disabled={isSaving}
                className="text-xs px-4 py-2 min-h-[38px] rounded-xl bg-primary text-primary-foreground font-black flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
              >
                {isSaving && <Loader2 className="size-3.5 animate-spin" />}
                שמור תוספת
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Tier Form Dialog */}
      <Dialog open={tierModalOpen} onOpenChange={(o) => !o && setTierModalOpen(false)}>
        <DialogContent className="max-w-md w-[96%] rounded-2xl p-5 text-right dir-rtl bg-background border shadow-lg focus:outline-none" dir="rtl">
          <DialogHeader className="space-y-1 text-right">
            <DialogTitle className="text-base font-extrabold flex items-center gap-2">
              <Truck className="size-5 text-primary" />
              {editingTierId ? "עריכת אפשרות משלוח" : "הוספת אפשרות משלוח חדשה"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              עדכן את מועד המשלוח והמחיר עבור לקוחותיך
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 mt-4">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700 block">שם אפשרות המשלוח</label>
              <Input
                value={tierForm.label}
                onChange={(e) => setTierForm(prev => ({ ...prev, label: e.target.value }))}
                placeholder="לדוגמה: משלוח מהיר 24 שעות"
                className="text-right"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700 block">מחיר המשלוח (₪)</label>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={tierForm.price}
                onChange={(e) => setTierForm(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                className="text-right"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700 block">תיאור זמני הגעה (אופציונלי)</label>
              <Input
                value={tierForm.desc}
                onChange={(e) => setTierForm(prev => ({ ...prev, desc: e.target.value }))}
                placeholder="לדוגמה: איסוף בבוקר, החזרה בערב"
                className="text-right"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTierModalOpen(false)}
                className="text-xs px-4 py-2 min-h-[38px] rounded-xl border border-muted-foreground/20 hover:bg-muted font-bold transition active:scale-95"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={handleSaveTier}
                disabled={isSaving}
                className="text-xs px-4 py-2 min-h-[38px] rounded-xl bg-primary text-primary-foreground font-black flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
              >
                {isSaving && <Loader2 className="size-3.5 animate-spin" />}
                שמור אפשרות
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
