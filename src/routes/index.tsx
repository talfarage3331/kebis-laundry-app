import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { AppHeader } from "@/components/AppHeader";
import { useLaundry, ORDER_STEPS, stateLabel } from "@/lib/laundry-store";
import { ShoppingBasket, ChevronLeft, Check, Camera, Trash2, Sparkles, Loader2, Shirt } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const { user, orderState, createOrder } = useLaundry();
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <AppLayout>
      <AppHeader subtitle={user ? `שלום, ${user.name}` : undefined} />
      <main className="px-5 mt-6">
        {orderState === "none" ? (
          <EmptyState onOpenModal={() => setIsModalOpen(true)} />
        ) : (
          <div className="bg-lavender/40 border border-lavender-foreground/10 rounded-3xl p-6 text-center space-y-4">
            <div className="size-16 bg-lime rounded-full grid place-items-center mx-auto shadow-sm">
              <ShoppingBasket className="size-8 text-lime-foreground animate-pulse" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-foreground">יש לך כביסה בטיפול!</h3>
              <p className="text-xs text-muted-foreground leading-relaxed px-4">הזמנתך התקבלה בהצלחה ונמצאת כעת בשלבי טיפול. תוכל לעקוב אחר ההתקדמות ולבצע תשלום במסך המעקב.</p>
            </div>
            <button
              onClick={() => navigate({ to: "/tracking" })}
              className="mt-2 w-full rounded-2xl bg-primary text-primary-foreground py-3 text-sm font-semibold hover:shadow-lg active:scale-95 transition"
            >
              עבור למסך מעקב הזמנה
            </button>
          </div>
        )}
        {orderState !== "none" && (
          <button
            onClick={() => navigate({ to: "/delivery" })}
            className="mt-3 w-full rounded-3xl border-2 border-primary text-primary px-5 py-4 font-semibold active:scale-[0.98] transition"
          >
            המשך לבחירת מסירה
          </button>
        )}
      </main>

      <PickupModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={async (notes, images, requiresIroning, requiresDryCleaning) => {
          await createOrder(notes, images, requiresIroning, requiresDryCleaning);
          setIsModalOpen(false);
          toast.success("הזמנת האיסוף נוצרה בהצלחה!");
        }}
      />
    </AppLayout>
  );
}

function EmptyState({ onOpenModal }: { onOpenModal: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 pt-4">
      <button
        onClick={onOpenModal}
        className="relative group size-64 rounded-full bg-lime text-lime-foreground shadow-[0_20px_50px_-12px_oklch(0.92_0.18_125/0.6)] active:scale-95 transition-all duration-300 flex flex-col items-center justify-center gap-3"
      >
        <ShoppingBasket className="size-16" strokeWidth={1.5} />
        <span className="text-xl font-extrabold leading-tight px-6 text-center">
          הזמן איסוף כביסה
        </span>
      </button>
      <p className="text-sm text-muted-foreground mt-1">לחיצה אחת ואנחנו בדרך אליך</p>
    </div>
  );
}

interface PickupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (notes: string, images: string[], requiresIroning: boolean, requiresDryCleaning: boolean) => Promise<void>;
}

function PickupModal({ isOpen, onClose, onSubmit }: PickupModalProps) {
  const [notes, setNotes] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [requiresIroning, setRequiresIroning] = useState(false);
  const [requiresDryCleaning, setRequiresDryCleaning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setNotes("");
      setImages([]);
      setRequiresIroning(false);
      setRequiresDryCleaning(false);
    }
  }, [isOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) {
        toast.error("אנא בחר קבצי תמונה בלבד");
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          setImages((prev) => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit(notes, images, requiresIroning, requiresDryCleaning);
      setNotes("");
      setImages([]);
      setRequiresIroning(false);
      setRequiresDryCleaning(false);
    } catch (e) {
      toast.error("שגיאה ביצירת ההזמנה");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md w-[92%] rounded-3xl p-6 text-right dir-rtl backdrop-blur-xl bg-background/95 border-none shadow-[0_20px_50px_rgba(0,0,0,0.15)] focus:outline-none" dir="rtl">
        <DialogHeader className="space-y-2 text-right">
          <DialogTitle className="text-2xl font-extrabold text-foreground flex items-center gap-2 justify-start">
            <Sparkles className="size-6 text-primary animate-pulse" />
            <span>פרטי איסוף כביסה</span>
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground text-right">
            הוסף דגשים מיוחדים או תמונות כדי שנדע בדיוק איך לטפל בבגדים שלך
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 my-4 text-right">
          <div className="space-y-2">
            <label className="text-sm font-bold text-foreground block">דגשים מיוחדים לכביסה</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="יש לך דגשים מיוחדים לכביסה? כתוב לנו כאן... (למשל: כביסה עדינה, כתם שומן בשרוול, להפריד צבעים)"
              className="min-h-[100px] rounded-2xl border-muted-foreground/20 focus-visible:ring-primary focus-visible:border-primary text-sm p-4 leading-relaxed text-right"
              dir="rtl"
            />
          </div>

          {/* Additional Services Section */}
          <div className="space-y-2.5">
            <label className="text-sm font-bold text-foreground block">שירותים נוספים (אופציונלי)</label>
            <div className="grid grid-cols-2 gap-4 text-right dir-rtl" dir="rtl">
              {/* Ironing Card */}
              <div
                onClick={() => setRequiresIroning(!requiresIroning)}
                className={`relative overflow-hidden rounded-3xl p-4 flex flex-col items-center justify-center gap-3 text-center cursor-pointer transition-all duration-300 border select-none ${
                  requiresIroning
                    ? "border-2 border-primary bg-primary/10 shadow-[0_8px_30px_rgba(124,58,237,0.15)] scale-[1.02]"
                    : "border-muted-foreground/10 bg-background/50 hover:bg-muted/30 hover:shadow-sm"
                }`}
              >
                {requiresIroning && (
                  <span className="absolute top-2.5 right-2.5 size-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm animate-in scale-in duration-200">
                    <Check className="size-3 stroke-[3]" />
                  </span>
                )}
                <div className={`size-12 rounded-2xl flex items-center justify-center transition-all ${
                  requiresIroning ? "bg-primary/20 scale-110" : "bg-muted/60"
                }`}>
                  <Shirt className={`size-6 transition-colors ${requiresIroning ? "text-primary animate-pulse" : "text-muted-foreground"}`} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className={`text-sm font-black transition-colors ${requiresIroning ? "text-primary" : "text-foreground"}`}>גיהוץ 🧺</span>
                  <span className="text-[10px] font-medium text-muted-foreground leading-normal">כולל קיפול ריחני</span>
                </div>
              </div>

              {/* Dry Cleaning Card */}
              <div
                onClick={() => setRequiresDryCleaning(!requiresDryCleaning)}
                className={`relative overflow-hidden rounded-3xl p-4 flex flex-col items-center justify-center gap-3 text-center cursor-pointer transition-all duration-300 border select-none ${
                  requiresDryCleaning
                    ? "border-2 border-primary bg-primary/10 shadow-[0_8px_30px_rgba(124,58,237,0.15)] scale-[1.02]"
                    : "border-muted-foreground/10 bg-background/50 hover:bg-muted/30 hover:shadow-sm"
                }`}
              >
                {requiresDryCleaning && (
                  <span className="absolute top-2.5 right-2.5 size-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm animate-in scale-in duration-200">
                    <Check className="size-3 stroke-[3]" />
                  </span>
                )}
                <div className={`size-12 rounded-2xl flex items-center justify-center transition-all ${
                  requiresDryCleaning ? "bg-primary/20 scale-110" : "bg-muted/60"
                }`}>
                  <Sparkles className={`size-6 transition-colors ${requiresDryCleaning ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className={`text-sm font-black transition-colors ${requiresDryCleaning ? "text-primary" : "text-foreground"}`}>ניקוי יבש ✨</span>
                  <span className="text-[10px] font-medium text-muted-foreground leading-normal">הסרת כתמים וטיפול עדין</span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-foreground block">צילום כתמים או פריטים עדינים (אופציונלי)</label>
            
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-muted-foreground/20 hover:border-primary/50 transition-colors rounded-2xl p-6 text-center cursor-pointer flex flex-col items-center justify-center gap-2 bg-muted/30 group"
            >
              <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Camera className="size-6 text-primary" />
              </div>
              <p className="text-sm font-semibold text-foreground">לחץ להעלאת תמונות</p>
              <p className="text-xs text-muted-foreground">ניתן להעלות מספר תמונות</p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {images.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2 justify-start">
                {images.map((img, idx) => (
                  <div key={idx} className="relative size-20 rounded-2xl overflow-hidden group border border-muted-foreground/10 shadow-sm">
                    <img src={img} alt="תצוגה מקדימה" className="size-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="absolute top-1 left-1 size-6 rounded-full bg-destructive/90 text-destructive-foreground grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity active:scale-95 shadow-sm"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 rounded-3xl bg-lime text-lime-foreground py-4 font-bold active:scale-[0.98] transition hover:shadow-lg hover:shadow-lime/20 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="size-5 animate-spin" />
                <span>מעבד הזמנה...</span>
              </>
            ) : (
              <span>אישור והזמנת איסוף</span>
            )}
          </button>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-3xl border border-muted-foreground/20 text-muted-foreground px-6 py-4 font-bold active:scale-[0.98] transition"
          >
            ביטול
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

