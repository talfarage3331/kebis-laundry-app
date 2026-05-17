import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { AppLayout } from "@/components/AppLayout";
import { AppHeader } from "@/components/AppHeader";
import { useLaundry, ORDER_STEPS, stateLabel } from "@/lib/laundry-store";
import { ShoppingBasket, ChevronLeft, Check, Camera, Trash2, Sparkles, Loader2 } from "lucide-react";
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
          <ActiveOrder />
        )}
        <Link
          to="/tracking"
          className="mt-6 flex items-center justify-between rounded-3xl bg-lavender text-lavender-foreground px-5 py-5 font-semibold shadow-sm active:scale-[0.98] transition"
        >
          <span>ההזמנות שלי / היסטוריה</span>
          <ChevronLeft className="size-5" strokeWidth={2} />
        </Link>
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
        onSubmit={async (notes, images) => {
          await createOrder(notes, images);
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

function ActiveOrder() {
  const { orderState, advanceOrder, orderNotes, orderImages } = useLaundry();
  const currentIdx = ORDER_STEPS.findIndex((s) => s.key === orderState);

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-lime text-lime-foreground p-5 shadow-[0_20px_50px_-15px_oklch(0.92_0.18_125/0.5)]">
        <p className="text-sm font-semibold opacity-70">סטטוס נוכחי</p>
        <h2 className="text-2xl font-extrabold mt-1">{stateLabel[orderState]}</h2>

        <div className="mt-6 flex items-center justify-between">
          {ORDER_STEPS.map((s, i) => {
            const done = i <= currentIdx;
            return (
              <div key={s.key} className="flex-1 flex flex-col items-center relative">
                {i > 0 && (
                  <div
                    className={`absolute right-1/2 top-3 h-1 w-full ${
                      i <= currentIdx ? "bg-primary" : "bg-lime-foreground/15"
                    }`}
                  />
                )}
                <div
                  className={`relative z-10 size-7 rounded-full grid place-items-center text-xs font-bold ${
                    done ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground border-2 border-lime-foreground/20"
                  }`}
                >
                  {done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
                </div>
                <span className="mt-2 text-[11px] font-semibold text-center">{s.label}</span>
              </div>
            );
          })}
        </div>

        {orderState === "in_progress" && (
          <p className="mt-5 text-sm font-semibold bg-primary/10 rounded-2xl px-4 py-2.5">
            זמן מוכנות משוער: 14:30
          </p>
        )}

        <button
          onClick={advanceOrder}
          disabled={orderState === "completed"}
          className="mt-4 w-full rounded-2xl bg-primary text-primary-foreground py-3 text-sm font-semibold disabled:opacity-50"
        >
          {orderState === "completed" ? "ההזמנה הושלמה" : "קדם סטטוס (דמו)"}
        </button>
      </div>

      {(orderNotes || (orderImages && orderImages.length > 0)) && (
        <div className="rounded-3xl bg-lavender text-lavender-foreground p-5 space-y-4 shadow-sm border border-lavender-foreground/5 text-right" dir="rtl">
          {orderNotes && (
            <div>
              <h3 className="font-extrabold text-sm mb-1 text-foreground">דגשים מיוחדים לכביסה:</h3>
              <p className="text-sm opacity-90 leading-relaxed text-muted-foreground">{orderNotes}</p>
            </div>
          )}
          
          {orderImages && orderImages.length > 0 && (
            <div>
              <h3 className="font-extrabold text-sm mb-2 text-foreground">תמונות שצורפו:</h3>
              <div className="flex gap-2 flex-wrap">
                {orderImages.map((img, idx) => (
                  <div key={idx} className="relative size-16 rounded-2xl overflow-hidden border-2 border-background shadow-sm hover:scale-105 transition-transform cursor-pointer">
                    <img
                      src={img}
                      alt="דגש מיוחד"
                      className="size-full object-cover"
                      onClick={() => {
                        toast.info("תמונה מצורפת לכביסה");
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface PickupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (notes: string, images: string[]) => Promise<void>;
}

function PickupModal({ isOpen, onClose, onSubmit }: PickupModalProps) {
  const [notes, setNotes] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      await onSubmit(notes, images);
      setNotes("");
      setImages([]);
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

