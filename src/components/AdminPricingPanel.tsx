/**
 * AdminPricingPanel — full CRUD pricing management (per-laundry).
 *
 * Every pricing item lives exclusively in `/laundries/{laundryId}/pricing/{itemId}`.
 * - Admin: sees a laundry selector; all mutations apply to the selected laundry only.
 * - Laundry vendor: auto-scoped to their own uid; can add, edit, and delete items freely.
 * - No global price list. No cross-vendor side effects.
 *
 * Edit modal exposes every field: name, price, unit, category (with inline "add new"),
 * description, and availability toggle.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  Plus,
  Edit2,
  Trash2,
  Check,
  Tag,
  ChevronDown,
  ChevronUp,
  Loader2,
  Store,
  Database,
  X,
  PenLine,
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
import {
  usePricing,
  resolveCategoryMeta,
  BASELINE_PRICING_ITEMS,
  type PricingItem,
} from "@/hooks/use-pricing";
import { useCategories } from "@/hooks/use-categories";
import { useLaundry } from "@/lib/laundry-store";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LaundryOption {
  id: string;
  name: string;
}

interface AdminPricingPanelProps {
  laundries?: LaundryOption[];
}

// ─── Empty item template ──────────────────────────────────────────────────────

const EMPTY_FORM: Omit<PricingItem, "id"> = {
  name_he: "",
  category: "washing",
  price: 0,
  description_he: "",
  unit: "לפריט",
  isAvailable: true,
};

// ─── Availability toggle ──────────────────────────────────────────────────────

function AvailabilityToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
      style={{ background: value ? "var(--primary)" : "var(--muted-foreground)" }}
    >
      <span
        className="inline-block size-4 rounded-full bg-white shadow transition-transform"
        style={{ transform: value ? "translateX(calc(100% + 5px))" : "translateX(3px)" }}
      />
    </button>
  );
}

// ─── Full item edit / add modal ───────────────────────────────────────────────

interface ItemFormProps {
  open: boolean;
  /** Pass `null` for "add new"; pass the full item for "edit" */
  item: PricingItem | null;
  laundryId: string;
  onClose: () => void;
}

function ItemFormModal({ open, item, laundryId, onClose }: ItemFormProps) {
  const isEditing = item !== null;

  const { categories, addCategory } = useCategories();

  // Initialise form from item (edit) or defaults (add)
  const [form, setForm] = useState<Omit<PricingItem, "id">>(() =>
    item ? { ...item } : { ...EMPTY_FORM },
  );
  const [saving, setSaving] = useState(false);

  // "Add new category" inline state
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatLabel, setNewCatLabel] = useState("");
  const [newCatEmoji, setNewCatEmoji] = useState("🏷️");
  const [addingCat, setAddingCat] = useState(false);

  // Re-sync form whenever the item prop changes (e.g. user clicks Edit on a different row)
  useEffect(() => {
    setForm(item ? { ...item } : { ...EMPTY_FORM });
    setShowNewCat(false);
    setNewCatLabel("");
    setNewCatEmoji("🏷️");
  }, [item, open]);

  const set = <K extends keyof Omit<PricingItem, "id">>(
    key: K,
    value: Omit<PricingItem, "id">[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  // ── Add new category inline ───────────────────────────────────────────────
  const handleAddCategory = async () => {
    if (!newCatLabel.trim()) return;
    setAddingCat(true);
    try {
      await addCategory(newCatLabel.trim(), newCatEmoji || "🏷️");
      // Find the newly added category by its label so we can pre-select it
      // (categories list updates via onSnapshot; we wait a tick)
      const label = newCatLabel.trim();
      setTimeout(() => {
        const match = categories.find((c) => c.label_he === label);
        if (match) set("category", match.id);
      }, 600);
      toast.success(`הקטגוריה "${newCatLabel}" נוספה`);
      setShowNewCat(false);
      setNewCatLabel("");
      setNewCatEmoji("🏷️");
    } catch (err: unknown) {
      toast.error("שגיאה בהוספת קטגוריה: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setAddingCat(false);
    }
  };

  // ── Save item ─────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name_he.trim()) {
      toast.error("נא להזין שם פריט");
      return;
    }
    if (form.price < 0) {
      toast.error("מחיר לא יכול להיות שלילי");
      return;
    }

    setSaving(true);
    try {
      const pricingCol = collection(db, "laundries", laundryId, "pricing");
      const payload = {
        name_he:        form.name_he.trim(),
        category:       form.category,
        price:          Number(form.price),
        description_he: form.description_he.trim(),
        unit:           form.unit.trim() || "לפריט",
        isAvailable:    form.isAvailable,
        updatedAt:      serverTimestamp(),
      };

      if (isEditing && item) {
        await updateDoc(doc(pricingCol, item.id), payload);
        toast.success("הפריט עודכן בהצלחה ✓");
      } else {
        await addDoc(pricingCol, { ...payload, createdAt: serverTimestamp() });
        toast.success("הפריט נוסף למחירון ✓");
      }
      onClose();
    } catch (err: unknown) {
      toast.error("שגיאה בשמירה: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-lg w-[96%] rounded-2xl p-0 text-right bg-background border border-border shadow-[0_24px_64px_rgba(0,0,0,0.18)] focus:outline-none max-h-[92dvh] flex flex-col overflow-hidden"
        dir="rtl"
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-border shrink-0">
          <DialogTitle className="text-base font-black flex items-center gap-2">
            <span className="size-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              {isEditing ? (
                <PenLine className="size-4 text-primary" />
              ) : (
                <Plus className="size-4 text-primary" />
              )}
            </span>
            {isEditing ? `עריכת פריט: ${item?.name_he}` : "הוספת פריט חדש"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            {isEditing
              ? "ערוך את כל פרטי הפריט ולחץ שמור"
              : "מלא את כל הפרטים ולחץ הוסף"}
          </DialogDescription>
        </DialogHeader>

        {/* ── Scrollable body ────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* 1 · Item name */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold block text-foreground">
              שם הפריט <span className="text-destructive">*</span>
            </label>
            <Input
              value={form.name_he}
              onChange={(e) => set("name_he", e.target.value)}
              placeholder="לדוגמה: גיהוץ חולצה מכופתרת"
              className="text-right h-11"
              autoFocus
            />
          </div>

          {/* 2 · Category */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold block text-foreground">קטגוריה</label>

            {!showNewCat ? (
              <div className="flex gap-2">
                <select
                  value={form.category}
                  onChange={(e) => set("category", e.target.value)}
                  className="flex-1 h-11 px-3 rounded-xl border border-muted-foreground/20 bg-background text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary text-right appearance-none"
                  dir="rtl"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.emoji} {c.label_he}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewCat(true)}
                  className="h-11 px-3 rounded-xl border border-dashed border-muted-foreground/30 text-xs font-bold text-muted-foreground hover:border-primary hover:text-primary transition shrink-0 flex items-center gap-1"
                >
                  <Plus className="size-3" />
                  חדשה
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
                <p className="text-xs font-bold text-primary">קטגוריה חדשה</p>
                <div className="flex gap-2">
                  <Input
                    value={newCatLabel}
                    onChange={(e) => setNewCatLabel(e.target.value)}
                    placeholder="שם הקטגוריה (עברית)"
                    className="flex-1 text-right h-9 text-sm"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
                  />
                  <Input
                    value={newCatEmoji}
                    onChange={(e) => setNewCatEmoji(e.target.value)}
                    placeholder="🏷️"
                    className="w-14 text-center h-9 text-base"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleAddCategory}
                    disabled={addingCat || !newCatLabel.trim()}
                    className="flex-1 h-8 rounded-lg bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-50 transition active:scale-95"
                  >
                    {addingCat ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                    הוסף קטגוריה
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowNewCat(false); setNewCatLabel(""); setNewCatEmoji("🏷️"); }}
                    className="h-8 px-3 rounded-lg border border-muted-foreground/20 text-xs font-bold text-muted-foreground hover:text-foreground transition"
                  >
                    ביטול
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 3 · Price + Unit (side by side) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold block text-foreground">
                מחיר (₪) <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">₪</span>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={form.price === 0 ? "" : form.price}
                  onChange={(e) => set("price", parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  className="text-right pr-7 h-11"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold block text-foreground">יחידת מדידה</label>
              <select
                value={form.unit}
                onChange={(e) => set("unit", e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-muted-foreground/20 bg-background text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary text-right appearance-none"
                dir="rtl"
              >
                {["לפריט", 'לק"ג', "לחליפה", "לסט", 'למ"ר', "לסל כביסה", "לשעה"].map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
                {/* Show current value even if not in list */}
                {!["לפריט", 'לק"ג', "לחליפה", "לסט", 'למ"ר', "לסל כביסה", "לשעה"].includes(form.unit) && (
                  <option value={form.unit}>{form.unit}</option>
                )}
              </select>
            </div>
          </div>

          {/* 4 · Description (multiline) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold block text-foreground">
              פירוט / תיאור השירות
            </label>
            <textarea
              value={form.description_he}
              onChange={(e) => set("description_he", e.target.value)}
              placeholder="תיאור קצר שיוצג ללקוחות (אופציונלי)..."
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl border border-muted-foreground/20 bg-background text-foreground text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary text-right resize-none"
              dir="rtl"
            />
          </div>

          {/* 5 · Availability */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-muted/40 border border-border">
            <div>
              <p className="text-sm font-bold">זמין ללקוחות</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {form.isAvailable ? "מוצג במחירון הציבורי" : "מוסתר מהמחירון"}
              </p>
            </div>
            <AvailabilityToggle
              value={form.isAvailable}
              onChange={(v) => set("isAvailable", v)}
            />
          </div>
        </div>

        {/* ── Footer buttons ──────────────────────────────────── */}
        <div className="px-5 py-4 border-t border-border flex gap-2 shrink-0 bg-muted/20">
          <button
            onClick={handleSave}
            disabled={saving || !form.name_he.trim()}
            className="flex-1 h-11 rounded-2xl bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {saving ? "שומר..." : isEditing ? "שמור שינויים" : "הוסף למחירון"}
          </button>
          <button
            onClick={onClose}
            disabled={saving}
            className="h-11 px-5 rounded-2xl border border-muted-foreground/20 text-sm font-bold active:scale-95 transition hover:bg-muted/40"
          >
            ביטול
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete confirmation modal ─────────────────────────────────────────────────

interface DeleteConfirmProps {
  item: PricingItem | null;
  laundryId: string;
  onClose: () => void;
}

function DeleteConfirmModal({ item, laundryId, onClose }: DeleteConfirmProps) {
  const [deleting, setDeleting] = useState(false);

  const handleConfirm = async () => {
    if (!item) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "laundries", laundryId, "pricing", item.id));
      toast.success(`"${item.name_he}" נמחק`);
      onClose();
    } catch (err: unknown) {
      toast.error("שגיאה במחיקה: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-sm w-[92%] rounded-2xl p-5 bg-background border border-border shadow-xl focus:outline-none"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle className="text-base font-black text-right flex items-center gap-2">
            <span className="size-8 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
              <Trash2 className="size-4 text-destructive" />
            </span>
            מחיקת פריט
          </DialogTitle>
          <DialogDescription className="text-right text-sm text-muted-foreground mt-2">
            האם אתה בטוח שברצונך למחוק את{" "}
            <span className="font-bold text-foreground">"{item?.name_he}"</span>?{" "}
            פעולה זו בלתי הפיכה.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 mt-4">
          <button
            onClick={handleConfirm}
            disabled={deleting}
            className="flex-1 h-11 rounded-2xl bg-destructive text-destructive-foreground text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition disabled:opacity-50"
          >
            {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            {deleting ? "מוחק..." : "כן, מחק"}
          </button>
          <button
            onClick={onClose}
            disabled={deleting}
            className="h-11 px-5 rounded-2xl border border-muted-foreground/20 text-sm font-bold active:scale-95 transition hover:bg-muted/40"
          >
            ביטול
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function AdminPricingPanel({ laundries = [] }: AdminPricingPanelProps) {
  const { user, role } = useLaundry();
  const [expanded, setExpanded] = useState(false);

  // For admins: the laundry chosen in the dropdown (auto-selects first when list loads).
  // For vendors: permanently locked to their own uid — never changeable.
  const [selectedLaundryId, setSelectedLaundryId] = useState<string | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (role === "laundry" && user?.uid) {
      // Vendor — always their own UID
      setSelectedLaundryId(user.uid);
      initializedRef.current = true;
    } else if (role === "admin") {
      // Admin — auto-pick first laundry as soon as the list arrives, but don't
      // override an already-made manual selection.
      if (!initializedRef.current && laundries.length > 0) {
        setSelectedLaundryId(laundries[0].id);
        initializedRef.current = true;
      }
    }
  }, [role, user?.uid, laundries]);

  const { items, loading, error } = usePricing(selectedLaundryId);
  const { categories } = useCategories();

  // ── Category manager (admin only, inside panel) ────────────────────────────
  const { addCategory, deleteCategory } = useCategories();
  const [newCatLabel, setNewCatLabel] = useState("");
  const [newCatEmoji, setNewCatEmoji] = useState("👕");
  const [isAddingCat, setIsAddingCat] = useState(false);

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatLabel.trim()) { toast.error("נא להזין שם קטגוריה"); return; }
    setIsAddingCat(true);
    try {
      await addCategory(newCatLabel, newCatEmoji);
      toast.success("הקטגוריה נוספה");
      setNewCatLabel("");
      setNewCatEmoji("👕");
    } catch (err: unknown) {
      toast.error("שגיאה: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsAddingCat(false);
    }
  };

  const handleDeleteCategory = async (id: string, label: string) => {
    if (!confirm(`למחוק את הקטגוריה "${label}"?`)) return;
    try {
      await deleteCategory(id);
      toast.success(`"${label}" נמחקה`);
    } catch (err: unknown) {
      toast.error("שגיאה: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  // ── Seed baseline ──────────────────────────────────────────────────────────
  const [isSeeding, setIsSeeding] = useState(false);

  const handleSeedBaseline = useCallback(async () => {
    if (!selectedLaundryId) return;
    if (items.length > 0) {
      toast.error("המחירון כבר מכיל פריטים. ניתן לזרוע ברירת מחדל רק למחירון ריק.");
      return;
    }
    setIsSeeding(true);
    try {
      const pricingCol = collection(db, "laundries", selectedLaundryId, "pricing");
      const batch = writeBatch(db);
      BASELINE_PRICING_ITEMS.forEach((item) => {
        batch.set(doc(pricingCol), {
          ...item,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
      toast.success(`נטענו ${BASELINE_PRICING_ITEMS.length} פריטי ברירת מחדל`);
    } catch (err: unknown) {
      toast.error("שגיאה: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsSeeding(false);
    }
  }, [selectedLaundryId, items.length]);

  // ── Inline price edit ──────────────────────────────────────────────────────
  const [draftPrices, setDraftPrices] = useState<Record<string, string>>({});
  const [savingPrice, setSavingPrice] = useState<string | null>(null);

  const handleSaveInlinePrice = async (item: PricingItem) => {
    if (!selectedLaundryId) return;
    const raw = draftPrices[item.id];
    if (raw === undefined) return;
    const parsed = parseFloat(raw);
    if (isNaN(parsed) || parsed < 0) { toast.error("מחיר לא תקין"); return; }
    setSavingPrice(item.id);
    try {
      await updateDoc(doc(db, "laundries", selectedLaundryId, "pricing", item.id), {
        price: parsed,
        updatedAt: serverTimestamp(),
      });
      toast.success("מחיר עודכן");
      setDraftPrices((prev) => { const n = { ...prev }; delete n[item.id]; return n; });
    } catch (err: unknown) {
      toast.error("שגיאה: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSavingPrice(null);
    }
  };

  const handleToggleAvailable = async (item: PricingItem) => {
    if (!selectedLaundryId) return;
    try {
      await updateDoc(doc(db, "laundries", selectedLaundryId, "pricing", item.id), {
        isAvailable: !item.isAvailable,
        updatedAt: serverTimestamp(),
      });
    } catch (err: unknown) {
      toast.error("שגיאה: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  // ── Modal state ────────────────────────────────────────────────────────────
  const [editItem, setEditItem] = useState<PricingItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<PricingItem | null>(null);
  const [modalMode, setModalMode] = useState<"add" | "edit" | null>(null);

  const openAdd = () => { setEditItem(null); setModalMode("add"); };
  const openEdit = (item: PricingItem) => { setEditItem(item); setModalMode("edit"); };
  const closeModal = () => { setModalMode(null); setEditItem(null); };

  // ── Derived ────────────────────────────────────────────────────────────────
  const availableCount = items.filter((i) => i.isAvailable).length;
  const selectedLaundryName =
    role === "laundry"
      ? ((user as any)?.businessName ?? "מכבסה שלי")
      : (laundries.find((l) => l.id === selectedLaundryId)?.name ?? selectedLaundryId ?? "—");

  return (
    <>
      {/* ── Collapsible trigger ─────────────────────────────────── */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full bg-primary/10 border-2 border-primary/20 text-primary hover:bg-primary hover:text-primary-foreground hover:border-primary rounded-2xl p-3 sm:p-4 flex items-center justify-between font-extrabold transition-all group active:scale-95 cursor-pointer min-h-[48px]"
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <div className="relative size-9 sm:size-10 shrink-0 rounded-full bg-background/50 grid place-items-center group-hover:bg-primary-foreground/20">
            <Tag className="size-4 sm:size-5" />
          </div>
          <div className="text-right min-w-0">
            <span className="block text-sm sm:text-base truncate">ניהול מחירונים</span>
            <span className="text-[10px] sm:text-xs opacity-80 font-semibold block mt-0.5">
              {loading ? "טוען..." : `${items.length} פריטים · ${availableCount} פעילים`}
            </span>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="size-5 shrink-0 opacity-70" />
        ) : (
          <ChevronDown className="size-5 shrink-0 opacity-50 group-hover:opacity-100 transition-all" />
        )}
      </button>

      {/* ── Panel body ──────────────────────────────────────────── */}
      {expanded && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">

          {/* Laundry selector — admin only */}
          {role === "admin" && (
            <div className="px-4 py-3 border-b border-border bg-primary/5 flex items-center gap-3" dir="rtl">
              <Store className="size-4 text-primary shrink-0" />
              <label className="text-xs font-bold text-foreground shrink-0">בחר מכבסה:</label>
              {laundries.length === 0 ? (
                <span className="text-xs text-muted-foreground italic">אין מכבסות רשומות במערכת</span>
              ) : (
                <select
                  value={selectedLaundryId ?? ""}
                  onChange={(e) => {
                    setSelectedLaundryId(e.target.value || null);
                    setDraftPrices({});
                  }}
                  className="flex-1 h-9 px-3 rounded-xl border border-muted-foreground/20 bg-background text-foreground text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary text-right appearance-none"
                  dir="rtl"
                >
                  <option value="">— בחר מכבסה —</option>
                  {laundries.map((l) => (
                    <option key={l.id} value={l.id}>🏪 {l.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* No selection guard */}
          {!selectedLaundryId && (
            <div className="py-14 text-center text-muted-foreground text-sm">
              <p className="text-4xl mb-3">🏪</p>
              <p className="font-semibold">בחר מכבסה כדי לנהל את המחירון שלה</p>
            </div>
          )}

          {selectedLaundryId && (
            <>
              {/* Toolbar */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30" dir="rtl">
                <div className="min-w-0">
                  <p className="text-sm font-black text-foreground truncate">
                    {selectedLaundryName}
                  </p>
                  {role === "admin" && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">מזהה: {selectedLaundryId}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {items.length === 0 && !loading && (
                    <button
                      onClick={handleSeedBaseline}
                      disabled={isSeeding}
                      className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-amber-100 text-amber-700 hover:bg-amber-200 transition active:scale-95 disabled:opacity-50"
                    >
                      {isSeeding ? <Loader2 className="size-3.5 animate-spin" /> : <Database className="size-3.5" />}
                      טען ברירת מחדל
                    </button>
                  )}
                  <button
                    onClick={openAdd}
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition active:scale-95"
                  >
                    <Plus className="size-3.5" />
                    הוסף פריט
                  </button>
                </div>
              </div>

              {/* Quick Category Manager — admin only */}
              {role === "admin" && (
                <div className="px-4 py-3 border-b border-border bg-muted/10" dir="rtl">
                  <span className="text-xs font-bold text-muted-foreground block mb-2">ניהול קטגוריות</span>
                  <form onSubmit={handleCreateCategory} className="flex gap-2 items-center">
                    <Input
                      value={newCatLabel}
                      onChange={(e) => setNewCatLabel(e.target.value)}
                      placeholder="שם קטגוריה חדשה"
                      className="text-right text-xs bg-background flex-1"
                      disabled={isAddingCat}
                    />
                    <Input
                      value={newCatEmoji}
                      onChange={(e) => setNewCatEmoji(e.target.value)}
                      placeholder="👕"
                      className="w-14 text-center text-xs bg-background"
                      disabled={isAddingCat}
                    />
                    <button
                      type="submit"
                      disabled={isAddingCat || !newCatLabel.trim()}
                      className="h-9 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-bold shrink-0 flex items-center gap-1 disabled:opacity-50 transition active:scale-95"
                    >
                      {isAddingCat ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
                      הוסף
                    </button>
                  </form>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {categories.map((c) => (
                      <div
                        key={c.id}
                        className={`flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border border-border/40 ${c.colorClass}`}
                      >
                        <span>{c.emoji}</span>
                        <span>{c.label_he}</span>
                        {["washing", "ironing", "dry_cleaning", "special"].includes(c.id) ? (
                          <span className="opacity-25 ml-0.5 cursor-not-allowed" title="קטגוריית בסיס">
                            <X className="size-2.5" />
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(c.id, c.label_he)}
                            className="ml-0.5 hover:text-destructive transition rounded-full"
                            title={`מחק ${c.label_he}`}
                          >
                            <X className="size-2.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Loading */}
              {loading && (
                <div className="py-14 flex justify-center">
                  <Loader2 className="size-7 text-primary animate-spin" />
                </div>
              )}

              {/* Error */}
              {error && !loading && (
                <p className="text-center py-10 text-sm text-destructive font-semibold">{error}</p>
              )}

              {/* Empty */}
              {!loading && !error && items.length === 0 && (
                <div className="py-14 text-center text-muted-foreground text-sm">
                  <p className="text-4xl mb-3">🏷️</p>
                  <p className="font-bold text-foreground mb-1">המחירון ריק</p>
                  <p className="text-xs">לחץ "טען ברירת מחדל" כדי להוסיף פריטים מוכנים, או לחץ "הוסף פריט".</p>
                </div>
              )}

              {/* Item rows */}
              {!loading && !error && items.length > 0 && (
                <div className="divide-y divide-border">
                  {items.map((item) => {
                    const meta = resolveCategoryMeta(item.category, categories);
                    const draftPrice = draftPrices[item.id];
                    const displayPrice = draftPrice !== undefined ? draftPrice : String(item.price);
                    const isDirty = draftPrice !== undefined && parseFloat(draftPrice) !== item.price;

                    return (
                      <div
                        key={item.id}
                        className={`flex items-center gap-2 px-3 sm:px-4 py-3 transition-colors hover:bg-muted/20 ${
                          item.isAvailable ? "" : "opacity-50"
                        }`}
                        dir="rtl"
                      >
                        {/* Category chip */}
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${meta.colorClass}`}
                          title={meta.label_he}
                        >
                          {meta.emoji}
                        </span>

                        {/* Name + description */}
                        <div className="flex-1 min-w-0 text-right">
                          <p className="text-sm font-bold text-foreground truncate">{item.name_he}</p>
                          {item.description_he && (
                            <p className="text-[11px] text-muted-foreground truncate">{item.description_he}</p>
                          )}
                          <p className="text-[10px] text-muted-foreground/60">{meta.label_he}</p>
                        </div>

                        {/* Inline price input */}
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-xs text-muted-foreground">₪</span>
                          <input
                            type="number"
                            min={0}
                            step={0.5}
                            value={displayPrice}
                            onChange={(e) =>
                              setDraftPrices((prev) => ({ ...prev, [item.id]: e.target.value }))
                            }
                            onBlur={() => isDirty && handleSaveInlinePrice(item)}
                            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                            className="w-16 text-right text-sm font-black border border-muted-foreground/20 rounded-lg px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                          <span className="text-[10px] text-muted-foreground hidden sm:inline">{item.unit}</span>
                          {savingPrice === item.id && <Loader2 className="size-3.5 text-primary animate-spin" />}
                        </div>

                        {/* Availability toggle */}
                        <AvailabilityToggle
                          value={item.isAvailable}
                          onChange={() => handleToggleAvailable(item)}
                        />

                        {/* Edit & Delete */}
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => openEdit(item)}
                            className="size-8 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 flex items-center justify-center transition active:scale-90"
                            title="ערוך פריט"
                          >
                            <Edit2 className="size-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteItem(item)}
                            className="size-8 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 flex items-center justify-center transition active:scale-90"
                            title="מחק פריט"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Edit / Add modal ────────────────────────────────────── */}
      {modalMode !== null && selectedLaundryId && (
        <ItemFormModal
          key={editItem?.id ?? "new"}
          open={modalMode !== null}
          item={modalMode === "edit" ? editItem : null}
          laundryId={selectedLaundryId}
          onClose={closeModal}
        />
      )}

      {/* ── Delete confirm modal ─────────────────────────────────── */}
      {deleteItem && selectedLaundryId && (
        <DeleteConfirmModal
          item={deleteItem}
          laundryId={selectedLaundryId}
          onClose={() => setDeleteItem(null)}
        />
      )}
    </>
  );
}
