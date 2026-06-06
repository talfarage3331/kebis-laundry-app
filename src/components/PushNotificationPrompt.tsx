/**
 * PushNotificationPrompt
 * ─────────────────────────────────────────────────────────────
 * A non-intrusive banner that asks the user to enable push
 * notifications. Mounts once (after a 3-second delay so it
 * doesn't compete with the page loading) and respects the user's
 * existing permission state.
 *
 * Usage — drop anywhere in your component tree (e.g. __root.tsx):
 *   <PushNotificationPrompt />
 */

import { useEffect, useState } from "react";
import { Bell, BellOff, X } from "lucide-react";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useLaundry } from "@/lib/laundry-store";

// ─── Pill Banner ──────────────────────────────────────────────────────────────

export function PushNotificationPrompt() {
  const { user } = useLaundry();
  const { supported, permission, status, error, requestPermission, subscription } =
    usePushNotifications({ userEmail: user?.email });

  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Show the banner after 3 s, but only when the user hasn't yet decided
  useEffect(() => {
    if (!supported) return;
    // Already subscribed or denied → don't bother
    if (permission === "granted" || permission === "denied") return;
    const t = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(t);
  }, [supported, permission]);

  // Hide after successful subscription
  useEffect(() => {
    if (status === "subscribed") {
      const t = setTimeout(() => setVisible(false), 2000);
      return () => clearTimeout(t);
    }
  }, [status]);

  if (!visible || dismissed || !supported) return null;

  const isLoading =
    status === "registering" ||
    status === "requesting-permission" ||
    status === "subscribing";

  return (
    <div
      role="dialog"
      aria-label="הפעלת התראות דחיפה"
      style={{
        // Fixed position at the top of the screen, RTL-friendly
        position: "fixed",
        top: "env(safe-area-inset-top, 12px)",
        right: "12px",
        left: "12px",
        zIndex: 9999,
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
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
        // Slide-in animation
        animation: "kebisaBannerIn 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards",
      }}
    >
      {/* Inject the keyframe once */}
      <style>{`
        @keyframes kebisaBannerIn {
          from { opacity: 0; transform: translateY(-20px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
      `}</style>

      {/* Bell Icon */}
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
        {status === "subscribed" ? (
          <Bell size={20} color="oklch(0.25 0.08 320)" strokeWidth={2.2} />
        ) : status === "denied" ? (
          <BellOff size={20} color="oklch(0.25 0.08 320)" strokeWidth={2.2} />
        ) : (
          <Bell size={20} color="oklch(0.25 0.08 320)" strokeWidth={2.2} />
        )}
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: "0.95rem", lineHeight: 1.3 }}>
          {status === "subscribed"
            ? "✓ התראות מופעלות!"
            : status === "denied"
            ? "התראות חסומות"
            : "קבל עדכונים על הכביסה שלך"}
        </p>
        <p
          style={{
            margin: "4px 0 0",
            fontSize: "0.8rem",
            opacity: 0.85,
            lineHeight: 1.4,
          }}
        >
          {status === "subscribed"
            ? "נשלח עדכון כשהכביסה תהיה מוכנה"
            : status === "denied"
            ? error ?? "אפשר לשנות את זה בהגדרות הדפדפן"
            : "נודיע לך כשהכביסה נלקחה, מוכנה ונמסרה"}
        </p>

        {/* CTA Button */}
        {status !== "subscribed" && status !== "denied" && (
          <button
            id="push-enable-btn"
            onClick={requestPermission}
            disabled={isLoading}
            style={{
              marginTop: 10,
              padding: "8px 20px",
              borderRadius: "999px",
              background: isLoading
                ? "oklch(0.92 0.18 125 / 0.5)"
                : "oklch(0.92 0.18 125)",
              color: "oklch(0.25 0.08 320)",
              fontWeight: 700,
              fontSize: "0.85rem",
              border: "none",
              cursor: isLoading ? "not-allowed" : "pointer",
              transition: "opacity 0.2s",
            }}
          >
            {isLoading ? "מפעיל..." : "הפעל התראות"}
          </button>
        )}
      </div>

      {/* Dismiss */}
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

// ─── Compact Settings Toggle (for a Settings / Profile page) ──────────────────

export function PushNotificationToggle() {
  const { user } = useLaundry();
  const { supported, permission, status, subscription, requestPermission, unsubscribe } =
    usePushNotifications({ userEmail: user?.email });

  if (!supported) return null;

  const isSubscribed = status === "subscribed" && !!subscription;
  const isLoading =
    status === "registering" ||
    status === "requesting-permission" ||
    status === "subscribing";

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
        fontFamily: "Heebo, Rubik, system-ui, sans-serif",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Bell
          size={18}
          color={isSubscribed ? "oklch(0.34 0.13 333)" : "oklch(0.5 0.04 320)"}
        />
        <div>
          <p style={{ margin: 0, fontWeight: 600, fontSize: "0.9rem" }}>
            התראות דחיפה
          </p>
          <p
            style={{
              margin: 0,
              fontSize: "0.75rem",
              color: "oklch(0.5 0.04 320)",
            }}
          >
            {isSubscribed
              ? "מופעל — תקבל עדכונים"
              : permission === "denied"
              ? "חסום בהגדרות הדפדפן"
              : "כבוי"}
          </p>
        </div>
      </div>

      {/* Toggle switch */}
      {permission !== "denied" && (
        <button
          id="push-toggle-btn"
          aria-pressed={isSubscribed}
          disabled={isLoading}
          onClick={isSubscribed ? unsubscribe : requestPermission}
          style={{
            width: 44,
            height: 24,
            borderRadius: 999,
            background: isSubscribed
              ? "oklch(0.34 0.13 333)"
              : "oklch(0.85 0.02 310)",
            border: "none",
            cursor: isLoading ? "not-allowed" : "pointer",
            position: "relative",
            transition: "background 0.25s",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 3,
              // Slide right when subscribed (RTL: right = "on")
              right: isSubscribed ? 3 : "auto",
              left: isSubscribed ? "auto" : 3,
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: "#fff",
              boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
              transition: "left 0.25s, right 0.25s",
            }}
          />
        </button>
      )}
    </div>
  );
}
