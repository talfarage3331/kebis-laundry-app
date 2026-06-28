import React, { useState } from "react";
import { collection, doc, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";
import { Check, Loader2, ArrowLeft, ArrowRight, Plus, Trash2, Tag, Shirt, Sparkles, Wind } from "lucide-react";

interface OnboardingWizardProps {
  laundryId: string;
  onComplete: () => void;
}

interface PriceItemInput {
  id: string; // for internal mapping
  name_he: string;
  category: "washing" | "ironing" | "dry_cleaning";
  price: number;
  description_he: string;
  unit: string;
  enabled: boolean;
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

const UNIT_OPTIONS = ["לפריט", "לפי ק\"ג", "לשקית", "לסל", "למערכת", "אחר"];

const INITIAL_CATALOG: PriceItemInput[] = [
  // Washing
  { id: "w1", name_he: "כביסה רגילה עד 7 ק\"ג", category: "washing", price: 65, description_he: "כביסה, ייבוש וקיפול של בגדים יומיומיים", unit: "לשקית", enabled: true },
  { id: "w2", name_he: "כביסה רגילה", category: "washing", price: 10, description_he: "כביסה, ייבוש וקיפול", unit: "לפי ק\"ג", enabled: false },
  { id: "w3", name_he: "כביסה עדינה", category: "washing", price: 15, description_he: "פריטים עדינים הדורשים טיפול מיוחד ללא סחיטה", unit: "לפריט", enabled: true },
  { id: "w4", name_he: "כביסה נגד כתמים", category: "washing", price: 20, description_he: "טיפול מסור ושטיפה מיוחדת להסרת כתמים קשים", unit: "לפריט", enabled: false },
  { id: "w5", name_he: "כביסת שמיכה זוגית / פוך", category: "washing", price: 45, description_he: "כביסה וייבוש עמוק לשמיכה גדולה", unit: "לפריט", enabled: true },
  { id: "w6", name_he: "סל כביסה משפחתי", category: "washing", price: 95, description_he: "סל כביסה שלם - כביסה, ייבוש וקיפול עד 12 ק\"ג", unit: "לסל", enabled: false },
  
  // Ironing
  { id: "i1", name_he: "גיהוץ חולצה מכופתרת", category: "ironing", price: 8, description_he: "גיהוץ מקצועי וחניקה של חולצה מכופתרת", unit: "לפריט", enabled: true },
  { id: "i2", name_he: "גיהוץ מכנסיים", category: "ironing", price: 10, description_he: "גיהוץ מכנסיים או ג'ינס עם קו קפל", unit: "לפריט", enabled: true },
  { id: "i3", name_he: "גיהוץ שמלה", category: "ironing", price: 20, description_he: "גיהוץ לשמלה קצרה או ארוכה", unit: "לפריט", enabled: true },
  { id: "i4", name_he: "גיהוץ חליפה שלמה", category: "ironing", price: 30, description_he: "גיהוץ מקצועי למכנסיים וז'קט", unit: "למערכת", enabled: false },
  { id: "i5", name_he: "גיהוץ מצעים", category: "ironing", price: 25, description_he: "גיהוץ חלק למצעים זוגיים", unit: "למערכת", enabled: false },

  // Dry Cleaning
  { id: "d1", name_he: "ניקוי יבש חליפת שני חלקים", category: "dry_cleaning", price: 65, description_he: "ניקוי יבש וגיהוץ מקצועי לחליפה גברים/נשים", unit: "למערכת", enabled: true },
  { id: "d2", name_he: "ניקוי יבש מעיל כבד", category: "dry_cleaning", price: 50, description_he: "ניקוי יבש מעיל חורף, צמר או פוך", unit: "לפריט", enabled: true },
  { id: "d3", name_he: "ניקוי יבש שמלת ערב", category: "dry_cleaning", price: 85, description_he: "שירות מקצועי לשמלת ערב מורכבת ועדינה", unit: "לפריט", enabled: true },
  { id: "d4", name_he: "ניקוי יבש סוודר / סריג", category: "dry_cleaning", price: 30, description_he: "טיפול להסרת כתמים ושמירה על הבד", unit: "לפריט", enabled: false },
];

const INITIAL_ADDONS: AddonInput[] = [
  { key: "eco_detergent", label: "חומרים ירוקים (Eco-Friendly)", price: 8, desc: "שימוש בחומרי כביסה אורגניים וידידותיים לסביבה", group: "שדרוגי פרימיום", enabled: true },
  { key: "extra_scent", label: "אקסטרה ריח ומרכך", price: 5, desc: "תוספת מרכך פרימיום לריח מוגבר ועמיד לאורך זמן", group: "שדרוגי פרימיום", enabled: true },
  { key: "delicate_treatment", label: "טיפול מיוחד להסרת כתמים", price: 12, desc: "טיפול מקדים קפדני בכתמים קשים לפני השטיפה", group: "שדרוגי פרימיום", enabled: true },
];

const INITIAL_TIERS: DeliveryTierInput[] = [
  { key: "zone_close", label: "משלוח קרוב (עד 2 ק\"מ)", price: 15, desc: "איסוף והחזרה לכתובות סמוכות", enabled: true },
  { key: "zone_medium", label: "משלוח עירוני (2-5 ק\"מ)", price: 25, desc: "שירות משלוחים לכל רחבי העיר", enabled: true },
  { key: "zone_far", label: "משלוח רחוק (5-10 ק\"מ)", price: 40, desc: "איסוף והחזרה ליישובים סמוכים", enabled: false },
];

export function OnboardingWizard({ laundryId, onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [pricingItems, setPricingItems] = useState<PriceItemInput[]>(INITIAL_CATALOG);
  const [addons, setAddons] = useState<AddonInput[]>(INITIAL_ADDONS);
  const [tiers, setTiers] = useState<DeliveryTierInput[]>(INITIAL_TIERS);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Step 1: Catalog Builders ---
  const updatePricingItem = (id: string, field: keyof PriceItemInput, value: any) => {
    setPricingItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const deletePricingItem = (id: string) => {
    setPricingItems(prev => prev.filter(item => item.id !== id));
  };

  const addPricingItem = (category: "washing" | "ironing" | "dry_cleaning") => {
    const newItem: PriceItemInput = {
      id: `custom_${Date.now()}`,
      name_he: "שירות חדש",
      category,
      price: 0,
      description_he: "",
      unit: "לפריט",
      enabled: true,
    };
    setPricingItems(prev => [...prev, newItem]);
  };

  // --- Step 2: Addons & Tiers Builders ---
  const updateAddon = (key: string, field: keyof AddonInput, value: any) => {
    setAddons(prev => prev.map(addon => addon.key === key ? { ...addon, [field]: value } : addon));
  };

  const deleteAddon = (key: string) => {
    setAddons(prev => prev.filter(addon => addon.key !== key));
  };

  const addAddon = () => {
    const newAddon: AddonInput = {
      key: `custom_addon_${Date.now()}`,
      label: "תוספת חדשה",
      price: 0,
      desc: "",
      group: "שדרוגי פרימיום",
      enabled: true,
    };
    setAddons(prev => [...prev, newAddon]);
  };

  const updateTier = (key: string, field: keyof DeliveryTierInput, value: any) => {
    setTiers(prev => prev.map(tier => tier.key === key ? { ...tier, [field]: value } : tier));
  };

  const deleteTier = (key: string) => {
    setTiers(prev => prev.filter(tier => tier.key !== key));
  };

  const addTier = () => {
    const newTier: DeliveryTierInput = {
      key: `custom_tier_${Date.now()}`,
      label: "אזור משלוח חדש",
      price: 0,
      desc: "",
      enabled: true,
    };
    setTiers(prev => [...prev, newTier]);
  };

  // --- Navigation & Submission ---
  const saveStep1 = () => {
    const activeItems = pricingItems.filter(i => i.enabled);
    if (activeItems.length === 0) {
      toast.error("יש לבחור לפחות שירות אחד למחירון");
      return;
    }
    for (const item of activeItems) {
      if (!item.name_he.trim()) {
        toast.error("חובה להזין שם תקין לכל שירות פעיל");
        return;
      }
    }
    setStep(2);
  };

  const submitAll = async () => {
    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);

      // 1. Write Pricing Subcollection (Only Enabled Items)
      const pricingColRef = collection(db, "laundries", laundryId, "pricing");
      pricingItems
        .filter(item => item.enabled)
        .forEach((item) => {
          const itemDocRef = doc(pricingColRef);
          batch.set(itemDocRef, {
            name_he: item.name_he,
            category: item.category,
            price: Number(item.price),
            description_he: item.description_he,
            unit: item.unit,
            isAvailable: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });

      // 2. Write Addons (Only Enabled Items)
      const addonsColRef = collection(db, "laundry_addons");
      addons
        .filter((a) => a.enabled)
        .forEach((addon) => {
          const addonDocRef = doc(addonsColRef);
          batch.set(addonDocRef, {
            laundryId,
            key: addon.key,
            label: addon.label,
            price: Number(addon.price),
            desc: addon.desc,
            group: addon.group,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });

      // 3. Write Delivery Tiers (Only Enabled Items)
      const tiersColRef = collection(db, "laundry_delivery_tiers");
      tiers
        .filter((t) => t.enabled)
        .forEach((tier) => {
          const tierDocRef = doc(tiersColRef);
          batch.set(tierDocRef, {
            laundryId,
            key: tier.key,
            label: tier.label,
            price: Number(tier.price),
            desc: tier.desc,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        });

      // 4. Complete Onboarding Status
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

  const renderCategorySection = (category: "washing" | "ironing" | "dry_cleaning", title: string, icon: React.ReactNode, bgColor: string, textColor: string) => {
    const items = pricingItems.filter(i => i.category === category);
    
    return (
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm text-right mb-6">
        <div className="flex items-center gap-3 mb-6">
          <div className={`size-10 rounded-xl flex items-center justify-center ${bgColor} ${textColor}`}>
            {icon}
          </div>
          <h2 className="text-lg font-black text-slate-800">{title}</h2>
        </div>

        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.id} className={`p-4 rounded-xl border transition-all ${item.enabled ? "bg-slate-50 border-primary/30" : "bg-white border-slate-100 opacity-60"}`}>
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-start gap-3 flex-1">
                  <input
                    type="checkbox"
                    checked={item.enabled}
                    onChange={(e) => updatePricingItem(item.id, "enabled", e.target.checked)}
                    className="size-5 rounded border-slate-300 text-primary focus:ring-primary mt-2 cursor-pointer shrink-0"
                  />
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      value={item.name_he}
                      onChange={(e) => updatePricingItem(item.id, "name_he", e.target.value)}
                      placeholder="שם השירות"
                      disabled={!item.enabled}
                      className="font-bold text-slate-800 text-sm md:text-base border-b border-transparent hover:border-slate-300 focus:border-primary focus:outline-none w-full bg-transparent py-1 transition text-right disabled:opacity-80"
                    />
                    <textarea
                      value={item.description_he}
                      onChange={(e) => updatePricingItem(item.id, "description_he", e.target.value)}
                      placeholder="פירוט השירות (למשל: כולל כביסה, ייבוש וקיפול ארוז בשקית)"
                      disabled={!item.enabled}
                      rows={2}
                      className="text-xs text-slate-500 w-full resize-none border border-transparent hover:border-slate-200 focus:border-primary focus:outline-none rounded bg-transparent p-1 transition text-right disabled:opacity-80"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-500">יחידה:</span>
                    <select
                      value={item.unit}
                      onChange={(e) => updatePricingItem(item.id, "unit", e.target.value)}
                      disabled={!item.enabled}
                      className="h-9 px-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary text-right disabled:opacity-80 appearance-none"
                      dir="rtl"
                    >
                      {UNIT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-500">מחיר (₪):</span>
                    <input
                      type="number"
                      min="0"
                      value={item.price === 0 ? "" : item.price}
                      onChange={(e) => updatePricingItem(item.id, "price", Number(e.target.value))}
                      disabled={!item.enabled}
                      placeholder="0"
                      className="w-20 h-9 px-2 rounded-lg border border-slate-200 text-center font-bold text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-80 bg-white"
                    />
                  </div>
                  
                  <button 
                    onClick={() => deletePricingItem(item.id)}
                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                    title="מחק שירות"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => addPricingItem(category)}
          className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-primary hover:text-primary/80 transition px-2 py-1 rounded-lg hover:bg-primary/5"
        >
          <Plus className="size-4" />
          הוסף שירות {title} מותאם אישית
        </button>
      </div>
    );
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
            <p className="text-xs text-slate-500 text-right">בניית מחירון שירותים דינמי</p>
          </div>
        </div>

        {/* Steps display */}
        <div className="flex items-center gap-2">
          <div className={`px-3 py-1 rounded-full text-xs font-black transition-all ${step === 1 ? "bg-primary text-primary-foreground" : "bg-emerald-100 text-emerald-800"}`}>
            {step > 1 ? "✓ שלב 1: מחירון שירותים" : "שלב 1: מחירון שירותים"}
          </div>
          <div className="w-6 h-0.5 bg-slate-200" />
          <div className={`px-3 py-1 rounded-full text-xs font-black transition-all ${step === 2 ? "bg-primary text-primary-foreground shadow animate-pulse" : "bg-slate-100 text-slate-400"}`}>
            שלב 2: תוספות ומשלוחים
          </div>
        </div>
      </header>

      {/* Main wizard body */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 overflow-y-auto pb-24">
        {step === 1 ? (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="text-right mb-6 px-2">
              <h2 className="text-xl font-black text-slate-800">בנה את המחירון שלך</h2>
              <p className="text-sm text-slate-500 mt-1">
                סמן בוי את השירותים שאתה מציע. תוכל לערוך כל פרט – את שם השירות, התיאור, המחיר, והיחידות.
              </p>
            </div>
            
            {renderCategorySection("washing", "שירותי כביסה", <Wind className="size-5" />, "bg-blue-100", "text-blue-600")}
            {renderCategorySection("ironing", "שירותי גיהוץ", <Shirt className="size-5" />, "bg-amber-100", "text-amber-600")}
            {renderCategorySection("dry_cleaning", "ניקוי יבש מיוחד", <Sparkles className="size-5" />, "bg-purple-100", "text-purple-600")}
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in duration-300 text-right">
            
            {/* Step 2: Addons */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <div className="size-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                  <Tag className="size-5" />
                </div>
                <h2 className="text-lg font-black text-slate-800">שדרוגים ותוספות פרימיום</h2>
              </div>
              <p className="text-xs text-slate-500 mb-6 px-13">
                הוסף שירותים מיוחדים שיאפשרו ללקוחות לשדרג את ההזמנה. ערוך את השמות והמחירים או הוסף חדשים.
              </p>

              <div className="space-y-4">
                {addons.map((addon) => (
                  <div key={addon.key} className={`p-4 rounded-xl border transition-all ${addon.enabled ? "bg-slate-50 border-primary/30" : "bg-white border-slate-100 opacity-60"}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        <input
                          type="checkbox"
                          checked={addon.enabled}
                          onChange={(e) => updateAddon(addon.key, "enabled", e.target.checked)}
                          className="size-5 rounded border-slate-300 text-primary focus:ring-primary mt-2 cursor-pointer shrink-0"
                        />
                        <div className="flex-1 space-y-2">
                          <input
                            type="text"
                            value={addon.label}
                            onChange={(e) => updateAddon(addon.key, "label", e.target.value)}
                            placeholder="שם התוספת"
                            disabled={!addon.enabled}
                            className="font-bold text-slate-800 text-sm border-b border-transparent hover:border-slate-300 focus:border-primary focus:outline-none w-full bg-transparent py-1 transition text-right disabled:opacity-80"
                          />
                          <input
                            type="text"
                            value={addon.desc}
                            onChange={(e) => updateAddon(addon.key, "desc", e.target.value)}
                            placeholder="תיאור קצר ללקוח"
                            disabled={!addon.enabled}
                            className="text-xs text-slate-500 w-full border-b border-transparent hover:border-slate-200 focus:border-primary focus:outline-none bg-transparent py-1 transition text-right disabled:opacity-80"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 mt-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-500">תוספת (₪):</span>
                          <input
                            type="number"
                            min="0"
                            value={addon.price === 0 ? "" : addon.price}
                            onChange={(e) => updateAddon(addon.key, "price", Number(e.target.value))}
                            disabled={!addon.enabled}
                            placeholder="0"
                            className="w-20 h-9 px-2 rounded-lg border border-slate-200 text-center font-bold text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white disabled:opacity-80"
                          />
                        </div>
                        <button 
                          onClick={() => deleteAddon(addon.key)}
                          className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              <button
                onClick={addAddon}
                className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-primary hover:text-primary/80 transition px-2 py-1 rounded-lg hover:bg-primary/5"
              >
                <Plus className="size-4" />
                הוסף שדרוג מותאם אישית
              </button>
            </div>

            {/* Delivery Tiers */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm mt-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="size-10 rounded-xl bg-teal-100 text-teal-600 flex items-center justify-center font-black text-lg">
                  📍
                </div>
                <h2 className="text-lg font-black text-slate-800">אזורי שירות ומחירי משלוח</h2>
              </div>
              <p className="text-xs text-slate-500 mb-6 px-13">
                הגדר את אזורי המשלוח של המכבסה. ניתן לערוך את שמות האזורים למשל ל"מרכז העיר" או "שכונת דרום".
              </p>

              <div className="space-y-4">
                {tiers.map((tier) => (
                  <div key={tier.key} className={`p-4 rounded-xl border transition-all ${tier.enabled ? "bg-slate-50 border-primary/30" : "bg-white border-slate-100 opacity-60"}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        <input
                          type="checkbox"
                          checked={tier.enabled}
                          onChange={(e) => updateTier(tier.key, "enabled", e.target.checked)}
                          className="size-5 rounded border-slate-300 text-primary focus:ring-primary mt-2 cursor-pointer shrink-0"
                        />
                        <div className="flex-1 space-y-2">
                          <input
                            type="text"
                            value={tier.label}
                            onChange={(e) => updateTier(tier.key, "label", e.target.value)}
                            placeholder="שם אזור המשלוח"
                            disabled={!tier.enabled}
                            className="font-bold text-slate-800 text-sm border-b border-transparent hover:border-slate-300 focus:border-primary focus:outline-none w-full bg-transparent py-1 transition text-right disabled:opacity-80"
                          />
                          <input
                            type="text"
                            value={tier.desc}
                            onChange={(e) => updateTier(tier.key, "desc", e.target.value)}
                            placeholder="תיאור אזור החלוקה"
                            disabled={!tier.enabled}
                            className="text-xs text-slate-500 w-full border-b border-transparent hover:border-slate-200 focus:border-primary focus:outline-none bg-transparent py-1 transition text-right disabled:opacity-80"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 mt-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-500">מחיר (₪):</span>
                          <input
                            type="number"
                            min="0"
                            value={tier.price === 0 ? "" : tier.price}
                            onChange={(e) => updateTier(tier.key, "price", Number(e.target.value))}
                            disabled={!tier.enabled}
                            placeholder="0"
                            className="w-20 h-9 px-2 rounded-lg border border-slate-200 text-center font-bold text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white disabled:opacity-80"
                          />
                        </div>
                        <button 
                          onClick={() => deleteTier(tier.key)}
                          className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              <button
                onClick={addTier}
                className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-primary hover:text-primary/80 transition px-2 py-1 rounded-lg hover:bg-primary/5"
              >
                <Plus className="size-4" />
                הוסף אזור חלוקה חדש
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer controls */}
      <footer className="bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between fixed bottom-0 left-0 right-0 z-20 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
        {step === 1 ? (
          <>
            <div className="text-xs text-slate-400 hidden sm:block">
              * כל הנתונים ניתנים לעריכה גם לאחר סיום ההקמה דרך לוח הבקרה.
            </div>
            <button
              onClick={saveStep1}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-8 py-3 rounded-xl font-bold hover:bg-primary/90 transition active:scale-95 text-sm sm:text-base mr-auto"
            >
              המשך לשלב הבא
              <ArrowLeft className="size-4" />
            </button>
          </>
        ) : (
          <div className="flex w-full justify-between items-center max-w-5xl mx-auto">
            <button
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-2 border border-slate-200 text-slate-600 px-6 py-3 rounded-xl font-bold hover:bg-slate-50 transition active:scale-95 text-sm sm:text-base bg-white"
            >
              <ArrowRight className="size-4" />
              חזור לשלב 1
            </button>

            <button
              onClick={submitAll}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-emerald-500 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base shadow-md"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  שומר ומקים חשבון...
                </>
              ) : (
                <>
                  <Check className="size-5" />
                  סיום והפעלת חשבון
                </>
              )}
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}
