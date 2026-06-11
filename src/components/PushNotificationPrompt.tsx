/**
 * PushNotificationPrompt — non-intrusive banner asking the user to
 * enable FCM push notifications. Mounts globally; respects current
 * permission state and only shows when permission === "default".
 */
import { useEffect, useState } from "react";
import { Bell, BellOff, X } from "lucide-react";
import { useFcm } from "@/hooks/use-fcm";
import { useLaundry } from "@/lib/laundry-store";

export function PushNotificationPrompt() {
  const { user } = useLaundry();
  const { status, permission, enable } = useFcm();

  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    if (permission !== "default") return;
    if (!user) return;
    const t = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(t);
  }, [permission, user]);

  useEffect(() => {
    if (status === "granted") {
      const t = setTimeout(() => setVisible(false), 2000);
      return () => clearTimeout(t);
    }
  }, [status]);

  if (!visible || dismissed) return null;
  const loading = status === "loading";

  return (
    <div
      role="dialog"
      aria-label="הפעלת התראות דחיפה"
      style={{
        position: "fixed",
        top: "env(safe-area-inset-top, 12px)",
        right: 12,
        left: 12,
        zIndex: 9999,
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "14px 16px",
        borderRadius: "1rem",
        background:
          "linear-gradient(135deg, oklch(0.34 0.13 333 / 0.95) 0%, oklch(0.28 0.1 333 / 0.95) 100%)",
        backdropFilter: "blur(12px)",
        boxShadow: "0 8px 32px oklch(0.34 0.13 333 / 0.4)",
        border: "1px solid oklch(0.92 0.18 125 / 0.3)",
        color: "#fff",
        fontFamily: "Heebo, Rubik, system-ui, sans-serif",
        direction: "rtl",
        animation: "kebisaBannerIn 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards",
      }}
    >
      <style>{`@keyframes kebisaBannerIn{from{opacity:0;transform:translateY(-20px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>

      <div
        style={{
          flexShrink: 0,
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: "oklch(0.92 0.18 125)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {status === "denied" ? (
          <BellOff size={20} color="oklch(0.25 0.08 320)" strokeWidth={2.2} />
        ) : (
          <Bell size={20} color="oklch(0.25 0.08 320)" strokeWidth={2.2} />
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: "0.95rem", lineHeight: 1.3 }}>
          {status === "granted"
            ? "✓ התראות מופעלות!"
            : status === "denied"
            ? "התראות חסומות"
            : "קבל עדכונים על הכביסה שלך"}
        </p>
        <p style={{ margin: "4px 0 0", fontSize: "0.8rem", opacity: 0.85, lineHeight: 1.4 }}>
          {status === "granted"
            ? "נשלח עדכון כשהכביסה תהיה מוכנה"
            : status === "denied"
            ? "אפשר לשנות את זה בהגדרות הדפדפן"
            : "נודיע לך על מחירים, סטטוס הזמנה והודעות חדשות"}
        </p>

        {status !== "granted" && status !== "denied" && (
          <button
            onClick={enable}
            disabled={loading}
            style={{
              marginTop: 10,
              padding: "8px 20px",
              borderRadius: 999,
              background: loading ? "oklch(0.92 0.18 125 / 0.5)" : "oklch(0.92 0.18 125)",
              color: "oklch(0.25 0.08 320)",
              fontWeight: 700,
              fontSize: "0.85rem",
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "מפעיל..." : "הפעל התראות"}
          </button>
        )}
      </div>

      <button
        aria-label="סגור"
        onClick={() => setDismissed(true)}
        style={{
          flexShrink: 0,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "rgba(255,255,255,0.7)",
          padding: 4,
          lineHeight: 1,
        }}
      >
        <X size={18} />
      </button>
    </div>
  );
}

/** Optional inline toggle for Settings/Profile pages */
export function PushNotificationToggle() {
  const { status, permission, enable, disable } = useFcm();
  if (typeof Notification === "undefined") return null;

  const isOn = status === "granted";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px",
        borderRadius: "0.75rem",
        background: "oklch(0.96 0.01 300)",
        direction: "rtl",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Bell size={18} color={isOn ? "oklch(0.34 0.13 333)" : "oklch(0.5 0.04 320)"} />
        <div>
          <p style={{ margin: 0, fontWeight: 600, fontSize: "0.9rem" }}>התראות דחיפה</p>
          <p style={{ margin: 0, fontSize: "0.75rem", color: "oklch(0.5 0.04 320)" }}>
            {isOn ? "מופעל" : permission === "denied" ? "חסום בהגדרות הדפדפן" : "כבוי"}
          </p>
        </div>
      </div>
      {permission !== "denied" && (
        <button
          onClick={isOn ? disable : enable}
          style={{
            width: 44,
            height: 24,
            borderRadius: 999,
            background: isOn ? "oklch(0.34 0.13 333)" : "oklch(0.85 0.02 310)",
            border: "none",
            cursor: "pointer",
            position: "relative",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 3,
              right: isOn ? 3 : "auto",
              left: isOn ? "auto" : 3,
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "#fff",
              boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
            }}
          />
        </button>
      )}
    </div>
  );
}
