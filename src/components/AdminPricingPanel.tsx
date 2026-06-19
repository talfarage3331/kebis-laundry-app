/**
 * AdminPricingPanel — full CRUD pricing management for admins.
 *
 * Uses the same `usePricing()` real-time hook as the customer view.
 * Writes are performed via Firestore `addDoc`, `updateDoc`, `deleteDoc`.
 * Follows the Dialog / Input / toast patterns already used in admin.tsx.
 */

import { useState } from "react";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  Plus,
  Edit2,
  Trash2,
  X,
  Check,
  Tag,
  ChevronDown,
  ChevronUp,
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
import { usePricing, resolveCategoryMeta, type PricingItem } from "@/hooks/use-pricing";
import { useCategories } from "@/hooks/use-categories";

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
      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ background: value ? "var(--primary)" : "var(--muted-foreground)" }}
    >
      <span
        className="inline-block size-4 rounded-full bg-white shadow transition-transform"
        style={{ transform: value ? "translateX(calc(100% + 5px))" : "translateX(3px)" }}
      />
    </button>
  );
}

// ─── Edit / Add modal ─────────────────────────────────────────────────────────

interface ItemFormProps {
  open: boolean;
  initial: Omit<PricingItem, "id"> | null;
  editingId: string | null;
  onClose: () => void;
}

function ItemFormModal({ open, initial, editingId, onClose }: ItemFormProps) {
  const [form, setForm] = useState<Omit<PricingItem, "id">>(initial ?? EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const { categories } = useCategories();

  // Sync form when dialog opens with new initial data
  // (we rely on parent resetting modal by changing key / open prop)

  const set = <K extends keyof Omit<PricingItem, "id">>(
    key: K,
    value: Omit<PricingItem, "id">[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

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
      if (editingId) {
        await updateDoc(doc(db, "pricing", editingId), {
          ...form,
          price: Number(form.price),
          updatedAt: serverTimestamp(),
        });
        toast.success("הפריט עודכן בהצלחה");
      } else {
        await addDoc(collection(db, "pricing"), {
          ...form,
          price: Number(form.price),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        toast.success("הפריט נוסף למחירון");
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("שגיאה בשמירה: " + msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-md w-[96%] rounded-2xl p-5 text-right dir-rtl bg-background/95 border-none shadow-[0_20px_50px_rgba(0,0,0,0.15)] focus:outline-none max-h-[90dvh] overflow-y-auto"
        dir="rtl"
      >
        <DialogHeader className="space-y-1 text-right">
          <DialogTitle className="text-lg font-black flex items-center gap-2">
            <Tag className="size-5 text-primary" />
            {editingId ? "עריכת פריט" : "הוספת פריט חדש"}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground text-right">
            {editingId ? "שנה את פרטי הפריט במחירון" : "הוסף שירות חדש למחירון הלקוחות"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold block">שם הפריט (עברית)</label>
            <Input
              value={form.name_he}
              onChange={(e) => set("name_he", e.target.value)}
              placeholder="לדוגמה: חולצה רגילה"
              className="text-right"
            />
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold block">קטגוריה</label>
            <select
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-muted-foreground/20 bg-background text-foreground text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary text-right appearance-none"
              dir="rtl"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.label_he}
                </option>
              ))}
            </select>
          </div>

          {/* Price + Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold block">מחיר (₪)</label>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={form.price}
                onChange={(e) => set("price", parseFloat(e.target.value) || 0)}
                className="text-right"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold block">יחידה</label>
              <Input
                value={form.unit}
                onChange={(e) => set("unit", e.target.value)}
                placeholder='לדוגמה: לפריט, לק"ג'
                className="text-right"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold block">תיאור (עברית)</label>
            <Input
              value={form.description_he}
              onChange={(e) => set("description_he", e.target.value)}
              placeholder="תיאור קצר של השירות..."
              className="text-right"
            />
          </div>

          {/* Availability */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border">
            <div>
              <p className="text-sm font-bold">זמין ללקוחות</p>
              <p className="text-[11px] text-muted-foreground">
                {form.isAvailable ? "מוצג במחירון" : "מוסתר מהמחירון"}
              </p>
            </div>
            <AvailabilityToggle
              value={form.isAvailable}
              onChange={(v) => set("isAvailable", v)}
            />
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-2 mt-5">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 h-11 rounded-2xl bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            {saving ? "שומר..." : "שמור"}
          </button>
          <button
            onClick={onClose}
            className="h-11 px-5 rounded-2xl border border-muted-foreground/20 text-sm font-bold active:scale-95 transition"
          >
            ביטול
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function AdminPricingPanel() {
  const { items, loading, error } = usePricing();
  const [expanded, setExpanded] = useState(false);

  // Category management state
  const { categories, addCategory, deleteCategory } = useCategories();
  const [newCatLabel, setNewCatLabel] = useState("");
  const [newCatEmoji, setNewCatEmoji] = useState("👕");
  const [isAddingCat, setIsAddingCat] = useState(false);

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatLabel.trim()) {
      toast.error("נא להזין שם קטגוריה");
      return;
    }
    setIsAddingCat(true);
    try {
      await addCategory(newCatLabel, newCatEmoji);
      toast.success("הקטגוריה נוספה בהצלחה");
      setNewCatLabel("");
      setNewCatEmoji("👕");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("שגיאה בהוספת קטגוריה: " + msg);
    } finally {
      setIsAddingCat(false);
    }
  };

  const handleDeleteCategory = async (id: string, label: string) => {
    if (!confirm(`האם אתה בטוח שברצונך למחוק את הקטגוריה "${label}"?`)) return;
    try {
      await deleteCategory(id);
      toast.success(`הקטגוריה "${label}" נמחקה בהצלחה`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("שגיאה במחיקת קטגוריה: " + msg);
    }
  };

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingInitial, setEditingInitial] = useState<Omit<PricingItem, "id"> | null>(null);

  // Inline price edit state: itemId → draft price string
  const [draftPrices, setDraftPrices] = useState<Record<string, string>>({});
  const [savingPrice, setSavingPrice] = useState<string | null>(null);

  const openAdd = () => {
    setEditingId(null);
    setEditingInitial({ ...EMPTY_FORM });
    setModalOpen(true);
  };

  const openEdit = (item: PricingItem) => {
    const { id, ...rest } = item;
    setEditingId(id);
    setEditingInitial({ ...rest });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setEditingInitial(null);
  };

  const handleDelete = async (item: PricingItem) => {
    if (!confirm(`למחוק את "${item.name_he}"? פעולה זו בלתי הפיכה.`)) return;
    try {
      await deleteDoc(doc(db, "pricing", item.id));
      toast.success("הפריט נמחק");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("שגיאה במחיקה: " + msg);
    }
  };

  const handleToggleAvailable = async (item: PricingItem) => {
    try {
      await updateDoc(doc(db, "pricing", item.id), {
        isAvailable: !item.isAvailable,
        updatedAt: serverTimestamp(),
      });
      toast.success(item.isAvailable ? "הפריט הוסתר" : "הפריט הופעל");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("שגיאה בעדכון: " + msg);
    }
  };

  const handleSaveInlinePrice = async (item: PricingItem) => {
    const raw = draftPrices[item.id];
    if (raw === undefined) return;
    const parsed = parseFloat(raw);
    if (isNaN(parsed) || parsed < 0) {
      toast.error("מחיר לא תקין");
      return;
    }
    setSavingPrice(item.id);
    try {
      await updateDoc(doc(db, "pricing", item.id), {
        price: parsed,
        updatedAt: serverTimestamp(),
      });
      setDraftPrices((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      toast.success("מחיר עודכן");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("שגיאה בעדכון מחיר: " + msg);
    } finally {
      setSavingPrice(null);
    }
  };

  const availableCount = items.filter((i) => i.isAvailable).length;

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
            <span className="block text-sm sm:text-base truncate">ניהול מחירון</span>
            <span className="text-[10px] sm:text-xs opacity-80 font-semibold block mt-0.5">
              {loading ? "טוען..." : `${items.length} פריטים, ${availableCount} פעילים`}
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
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
            <span className="text-sm font-black text-foreground">פריטי מחירון</span>
            <button
              onClick={openAdd}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition active:scale-95"
            >
              <Plus className="size-3.5" />
              הוסף פריט
            </button>
          </div>

          {/* Quick Category Manager */}
          <div className="px-4 py-3 border-b border-border bg-muted/10 flex flex-col gap-3 text-right dir-rtl" dir="rtl">
            <span className="text-xs font-bold text-muted-foreground block">ניהול קטגוריות מהיר</span>
            <form onSubmit={handleCreateCategory} className="flex gap-2 items-center">
              <div className="flex-1 flex gap-2">
                <Input
                  value={newCatLabel}
                  onChange={(e) => setNewCatLabel(e.target.value)}
                  placeholder="שם קטגוריה חדשה (לדוגמה: נעליים)"
                  className="text-right text-xs bg-background"
                  disabled={isAddingCat}
                />
                <Input
                  value={newCatEmoji}
                  onChange={(e) => setNewCatEmoji(e.target.value)}
                  placeholder="אימוג׳י (👕)"
                  className="w-16 text-center text-xs bg-background"
                  disabled={isAddingCat}
                />
              </div>
              <button
                type="submit"
                disabled={isAddingCat}
                className="h-10 px-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition text-xs font-bold shrink-0 flex items-center gap-1 cursor-pointer"
              >
                {isAddingCat ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Plus className="size-3" />
                )}
                <span>+ הוסף קטגוריה חדשה</span>
              </button>
            </form>

            {/* List of existing categories */}
            <div className="flex flex-wrap gap-1.5 items-center mt-1">
              <span className="text-[11px] font-bold text-muted-foreground ml-1">קטגוריות קיימות:</span>
              {categories.map((c) => (
                <div
                  key={c.id}
                  className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border border-border/40 ${c.colorClass}`}
                >
                  <span>{c.emoji}</span>
                  <span>{c.label_he}</span>
                  {["washing", "ironing", "dry_cleaning", "special"].includes(c.id) ? (
                    <span
                      className="text-muted-foreground/35 mr-1 p-0.5 flex items-center justify-center cursor-not-allowed"
                      title="קטגוריית בסיס (לא ניתן למחוק)"
                    >
                      <Trash2 className="size-3" />
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(c.id, c.label_he)}
                      className="hover:text-destructive transition mr-1 cursor-pointer p-0.5 rounded-full hover:bg-black/5 flex items-center justify-center"
                      title={`מחק את ${c.label_he}`}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div className="py-12 flex justify-center">
              <Loader2 className="size-7 text-primary animate-spin" />
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <p className="text-center py-8 text-sm text-destructive">{error}</p>
          )}

          {/* Empty */}
          {!loading && !error && items.length === 0 && (
            <div className="py-12 text-center text-muted-foreground text-sm">
              <p className="text-3xl mb-2">🏷️</p>
              אין פריטים במחירון. לחץ "הוסף פריט" כדי להתחיל.
            </div>
          )}

          {/* Rows */}
          {!loading && !error && items.length > 0 && (
            <div className="divide-y divide-border">
              {items.map((item) => {
                const meta = resolveCategoryMeta(item.category, categories);
                const draftPrice = draftPrices[item.id];
                const displayPrice =
                  draftPrice !== undefined ? draftPrice : String(item.price);
                const isDirty = draftPrice !== undefined && parseFloat(draftPrice) !== item.price;

                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-2 px-4 py-3 transition ${
                      item.isAvailable ? "" : "opacity-50"
                    }`}
                  >
                    {/* Category dot */}
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${meta.colorClass}`}
                    >
                      {meta.emoji}
                    </span>

                    {/* Name + description */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{item.name_he}</p>
                      {item.description_he && (
                        <p className="text-[11px] text-muted-foreground truncate">
                          {item.description_he}
                        </p>
                      )}
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
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.currentTarget.blur();
                          }
                        }}
                        className="w-16 text-right text-sm font-black border border-muted-foreground/20 rounded-lg px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                        style={{ fontSize: 14 }}
                      />
                      <span className="text-[10px] text-muted-foreground">{item.unit}</span>
                      {savingPrice === item.id && (
                        <Loader2 className="size-3.5 text-primary animate-spin" />
                      )}
                    </div>

                    {/* Availability toggle */}
                    <AvailabilityToggle
                      value={item.isAvailable}
                      onChange={() => handleToggleAvailable(item)}
                    />

                    {/* Actions */}
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => openEdit(item)}
                        className="size-8 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 flex items-center justify-center transition active:scale-90"
                        title="ערוך פריט"
                      >
                        <Edit2 className="size-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
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
        </div>
      )}

      {/* ── Form modal ──────────────────────────────────────────── */}
      {modalOpen && editingInitial !== null && (
        <ItemFormModal
          open={modalOpen}
          initial={editingInitial}
          editingId={editingId}
          onClose={closeModal}
        />
      )}
    </>
  );
}
