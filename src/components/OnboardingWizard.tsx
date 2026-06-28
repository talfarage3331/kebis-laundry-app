import React, { useState } from "react";
import { collection, doc, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";
import { Check, Loader2, ArrowLeft, ArrowRight } from "lucide-react";

interface OnboardingWizardProps {
  laundryId: string;
  onComplete: () => void;
}

interface PriceItemInput {
  name_he: string;
  category: string;
  price: number;
  description_he: string;
  unit: string;
}

interface AddonInput {
  key: string;
  label: string;
  price: number;
  desc: string;
  group: string;
  enabled: boolean;
}

interface DeliveryTierInput {
  key: string;
  label: string;
  price: number;
  desc: string;
  enabled: boolean;
}

const CANONICAL_PRICING: PriceItemInput[] = [
  { name_he: "כביסה רגילה (עד 7 ק\"ג)", category: "washing", price: 65, description_he: "כביסה, ייבוש וקיפול של בגדים יומיומיים", unit: "לשקית" },
  { name_he: "כביסה עדינה", category: "washing", price: 15, description_he: "פריטים עדינים הדורשים טיפול מיוחד או כביסה ביד", unit: "לפריט" },
  { name_he: "כביסת שמיכה זוגית", category: "washing", price: 45, description_he: "כביסה וייבוש שמיכה זוגית גדולה או פוך", unit: "לפריט" },
  { name_he: "גיהוץ חולצה מכופתרת", category: "ironing", price: 8, description_he: "גיהוץ מקצועי וחניקה של חולצה מכופתרת", unit: "לפריט" },
  { name_he: "גיהוץ מכנסיים", category: "ironing", price: 10, description_he: "גיהוץ מכנסיים או ג'ינס עם קו קפל", unit: "לפריט" },
  { name_he: "גיהוץ שמלה", category: "ironing", price: 20, description_he: "גיהוץ שמלה קצרה או ארוכה", unit: "לפריט" },
  { name_he: "ניקוי יבש חליפת שני חלקים", category: "dry_cleaning", price: 65, description_he: "ניקוי יבש וגיהוץ מקצועי לחליפה גברים/נשים", unit: "לפריט" },
  { name_he: "ניקוי יבש שמלת ערב", category: "dry_cleaning", price: 85, description_he: "ניקוי יבש שמלת ערב עדינה או שמלה ארוכה", unit: "לפריט" },
  { name_he: "ניקוי יבש מעיל כבד", category: "dry_cleaning", price: 50, description_he: "ניקוי יבש מעיל צמר, גשם או מעיל פוך", unit: "לפריט" },
  { name_he: "סל כביסה משפחתי ענק", category: "washing", price: 95, description_he: "כביסה, ייבוש וקיפול של כמות גדולה במיוחד", unit: "לשקית" },
];

const CANONICAL_ADDONS: AddonInput[] = [
  { key: "eco_detergent", label: "חומרים ירוקים (Eco-Friendly)", price: 8, desc: "שימוש בחומרי כביסה אורגניים וידידותיים לסביבה", group: "שדרוגי פרימיום", enabled: true },
  { key: "extra_scent", label: "אקסטרה ריח ומרכך", price: 5, desc: "תוספת מרכך פרימיום לריח מוגבר ועמיד לאורך זמן", group: "שדרוגי פרימיום", enabled: true },
  { key: "delicate_treatment", label: "טיפול מיוחד להסרת כתמים", price: 12, desc: "טיפול מקדים קפדני בכתמים קשים לפני השטיפה", group: "שדרוגי פרימיום", enabled: true },
];

const CANONICAL_TIERS: DeliveryTierInput[] = [
  { key: "zone_close", label: "משלוח קרוב (עד 2 ק\"מ)", price: 15, desc: "איסוף והחזרה לכתובות סמוכות", enabled: true },
  { key: "zone_medium", label: "משלוח עירוני (2-5 ק\"מ)", price: 25, desc: "שירות משלוחים לכל רחבי העיר", enabled: true },
  { key: "zone_far", label: "משלוח רחוק (5-10 ק\"מ)", price: 40, desc: "איסוף והחזרה ליישובים סמוכים", enabled: false },
];

export function OnboardingWizard({ laundryId, onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [pricingItems, setPricingItems] = useState<PriceItemInput[]>(CANONICAL_PRICING);
  const [addons, setAddons] = useState<AddonInput[]>(CANONICAL_ADDONS);
  const [tiers, setTiers] = useState<DeliveryTierInput[]>(CANONICAL_TIERS);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handlePriceChange = (index: number, newPrice: number) => {
    const updated = [...pricingItems];
    updated[index].price = Math.max(0, newPrice);
    setPricingItems(updated);
  };

  const handleNameChange = (index: number, newName: string) => {
    const updated = [...pricingItems];
    updated[index].name_he = newName;
    setPricingItems(updated);
  };

  const handleAddonChange = (index: number, field: "price" | "enabled", val: any) => {
    const updated = [...addons];
    if (field === "price") {
      updated[index].price = Math.max(0, Number(val));
    } else {
      updated[index].enabled = !!val;
    }
    setAddons(updated);
  };

  const handleTierChange = (index: number, field: "price" | "enabled", val: any) => {
    const updated = [...tiers];
    if (field === "price") {
      updated[index].price = Math.max(0, Number(val));
    } else {
      updated[index].enabled = !!val;
    }
    setTiers(updated);
  };

  const saveStep1 = () => {
    for (const item of pricingItems) {
      if (!item.name_he.trim()) {
        toast.error("יש להזין שם תקין לכל הפריטים");
        return;
      }
    }
    setStep(2);
  };

  const submitAll = async () => {
    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);

      // 1. Write pricing subcollection
      const pricingColRef = collection(db, "laundries", laundryId, "pricing");
      pricingItems.forEach((item) => {
        const itemDocRef = doc(pricingColRef);
        batch.set(itemDocRef, {
          ...item,
          isAvailable: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });

      // 2. Write addons
      const addonsColRef = collection(db, "laundry_addons");
      addons
        .filter((a) => a.enabled)
        .forEach((addon) => {
          const addonDocRef = doc(addonsColRef);
          batch.set(addonDocRef, {
            laundryId,
            key: addon.key,
            label: addon.label,
            price: addon.price,
            desc: addon.desc,
            group: addon.group,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });

      // 3. Write delivery tiers
      const tiersColRef = collection(db, "laundry_delivery_tiers");
      tiers
        .filter((t) => t.enabled)
        .forEach((tier) => {
          const tierDocRef = doc(tiersColRef);
          batch.set(tierDocRef, {
            laundryId,
            key: tier.key,
            label: tier.label,
            price: tier.price,
            desc: tier.desc,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });

      // 4. Complete user onboarding status
      const userRef = doc(db, "users", laundryId);
      batch.update(userRef, {
        onboardingCompleted: true,
        status: "pending_approval",
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      toast.success("הגדרות המכבסה נשמרו בהצלחה!");
      onComplete();
    } catch (error: any) {
      console.error("Onboarding setup failed: ", error);
      toast.error("שגיאה בשמירת הנתונים: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between" dir="rtl">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="size-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary font-black text-xl">
            🧺
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-800 text-right">הגדרת מכבסה חדשה</h1>
            <p className="text-xs text-slate-500 text-right">בוא נכין את המכבסה שלך לקבלת הזמנות</p>
          </div>
        </div>

        {/* Steps display */}
        <div className="flex items-center gap-2">
          <div className={`px-3 py-1 rounded-full text-xs font-black transition-all ${step === 1 ? "bg-primary text-primary-foreground" : "bg-emerald-100 text-emerald-800"}`}>
            {step > 1 ? "✓ שלב 1: מחירון" : "שלב 1: מחירון"}
          </div>
          <div className="w-6 h-0.5 bg-slate-200" />
          <div className={`px-3 py-1 rounded-full text-xs font-black transition-all ${step === 2 ? "bg-primary text-primary-foreground animate-pulse" : "bg-slate-100 text-slate-400"}`}>
            שלב 2: תוספות ומשלוחים
          </div>
        </div>
      </header>

      {/* Main wizard body */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 overflow-y-auto">
        {step === 1 ? (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm text-right">
              <h2 className="text-base font-black text-slate-800 mb-2">שלב 1: הגדרת מחירון בסיסי</h2>
              <p className="text-xs text-slate-500 mb-6">
                לפניך 10 פריטים נפוצים שנקבעו מראש. אנא עבור עליהם, שנה את השמות במידת הצורך וקבע את המחירים המתאימים לעסק שלך.
              </p>

              <div className="divide-y divide-slate-100">
                {pricingItems.map((item, idx) => (
                  <div key={idx} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-right">
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        value={item.name_he}
                        onChange={(e) => handleNameChange(idx, e.target.value)}
                        className="font-bold text-slate-800 text-sm border-b border-transparent hover:border-slate-300 focus:border-primary focus:outline-none w-full bg-transparent py-1 transition text-right"
                      />
                      <p className="text-xs text-slate-400 mt-1">{item.description_he}</p>
                      <div className="flex gap-2 mt-2 justify-start">
                        <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-full font-bold text-slate-500">
                          {item.category === "washing" ? "כביסה" : item.category === "ironing" ? "גיהוץ" : "ניקוי יבש"}
                        </span>
                        <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-full font-bold text-slate-500">
                          יחידה: {item.unit}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 justify-end">
                      <span className="text-sm font-black text-slate-500">מחיר (₪)</span>
                      <input
                        type="number"
                        min="0"
                        value={item.price || ""}
                        onChange={(e) => handlePriceChange(idx, Number(e.target.value))}
                        className="w-24 h-10 px-3 rounded-lg border border-slate-200 text-center font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-lg"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in duration-300 text-right">
            {/* Step 2: Addons */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
              <h2 className="text-base font-black text-slate-800 mb-2">שלב 2: שדרוגים ותוספות פרימיום</h2>
              <p className="text-xs text-slate-500 mb-6">
                הוסף שירותים מיוחדים שיאפשרו ללקוחות לשדרג את ההזמנה שלהם בתוספת תשלום.
              </p>

              <div className="space-y-4">
                {addons.map((addon, idx) => (
                  <div key={addon.key} className={`p-4 rounded-xl border transition-all ${addon.enabled ? "bg-slate-50 border-primary/30" : "bg-white border-slate-100"}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={addon.enabled}
                          onChange={(e) => handleAddonChange(idx, "enabled", e.target.checked)}
                          className="size-5 rounded border-slate-300 text-primary focus:ring-primary mt-1 cursor-pointer"
                        />
                        <div>
                          <label className="font-bold text-slate-800 text-sm cursor-pointer">{addon.label}</label>
                          <p className="text-xs text-slate-400 mt-1">{addon.desc}</p>
                        </div>
                      </div>

                      {addon.enabled && (
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-bold text-slate-500">מחיר (₪)</span>
                          <input
                            type="number"
                            min="0"
                            value={addon.price || ""}
                            onChange={(e) => handleAddonChange(idx, "price", e.target.value)}
                            className="w-20 h-10 px-2 rounded-lg border border-slate-200 text-center font-bold text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Delivery Tiers */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
              <h2 className="text-base font-black text-slate-800 mb-2">אזורי שירות ומחירי משלוח</h2>
              <p className="text-xs text-slate-500 mb-6">
                הגדר את מחירי המשלוח של המכבסה לפי המרחק מכתובת העסק שלך.
              </p>

              <div className="space-y-4">
                {tiers.map((tier, idx) => (
                  <div key={tier.key} className={`p-4 rounded-xl border transition-all ${tier.enabled ? "bg-slate-50 border-primary/30" : "bg-white border-slate-100"}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={tier.enabled}
                          onChange={(e) => handleTierChange(idx, "enabled", e.target.checked)}
                          className="size-5 rounded border-slate-300 text-primary focus:ring-primary mt-1 cursor-pointer"
                        />
                        <div>
                          <label className="font-bold text-slate-800 text-sm cursor-pointer">{tier.label}</label>
                          <p className="text-xs text-slate-400 mt-1">{tier.desc}</p>
                        </div>
                      </div>

                      {tier.enabled && (
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-bold text-slate-500">מחיר (₪)</span>
                          <input
                            type="number"
                            min="0"
                            value={tier.price || ""}
                            onChange={(e) => handleTierChange(idx, "price", e.target.value)}
                            className="w-20 h-10 px-2 rounded-lg border border-slate-200 text-center font-bold text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer controls */}
      <footer className="bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between sticky bottom-0 z-10 shadow-md">
        {step === 1 ? (
          <>
            <div className="text-xs text-slate-400">
              * כל המחירים ניתנים לשינוי גם לאחר סיום ההקמה דרך לוח הבקרה.
            </div>
            <button
              onClick={saveStep1}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-xl font-bold hover:bg-primary/90 transition active:scale-95 text-sm"
            >
              המשך לשלב הבא
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-2 border border-slate-200 text-slate-600 px-6 py-3 rounded-xl font-bold hover:bg-slate-50 transition active:scale-95 text-sm"
            >
              חזור לשלב 1
            </button>

            <button
              onClick={submitAll}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-500 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  שומר הגדרות...
                </>
              ) : (
                <>
                  <Check className="size-4" />
                  סיום והפעלת חשבון
                </>
              )}
            </button>
          </>
        )}
      </footer>
    </div>
  );
}
