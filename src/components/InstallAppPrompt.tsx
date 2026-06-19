/**
 * InstallAppPrompt — cross-platform PWA install prompt.
 *
 * • Android  : captures `beforeinstallprompt`, shows a top banner that
 *              calls `.prompt()` when the user taps the CTA.
 * • iOS      : detects iOS Safari (non-standalone), shows a bottom sheet
 *              with Hebrew instructions to use the Share → "Add to Home Screen" flow.
 * • Both     : hidden when the app is already running in standalone mode OR
 *              the user has previously dismissed the prompt (localStorage key).
 */

import { useEffect, useState } from "react";
import { X, Download, Share } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

/** The non-standard browser event fired before the install prompt is shown. */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LS_KEY = "kebisa_install_dismissed";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // Must be iOS device…
  const isIos = /iPhone|iPad|iPod/.test(ua);
  // …and NOT a Chrome/Firefox/Edge wrapper (they report as CriOS, FxiOS, etc.)
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|mercury/.test(ua);
  return isIos && isSafari;
}

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(LS_KEY) === "1";
  } catch {
    return false;
  }
}

function markDismissed(): void {
  try {
    localStorage.setItem(LS_KEY, "1");
  } catch {
    // ignore private-mode errors
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface AndroidBannerProps {
  onInstall: () => void;
  onDismiss: () => void;
}

function AndroidBanner({ onInstall, onDismiss }: AndroidBannerProps) {
  return (
    <div
      role="dialog"
      aria-label="התקנת האפליקציה"
      className="fixed top-0 left-0 right-0 z-[9998] flex items-start gap-3 px-4 py-3"
      style={{
        paddingTop: "max(12px, env(safe-area-inset-top))",
        background: "linear-gradient(135deg, oklch(0.34 0.13 333 / 0.97) 0%, oklch(0.28 0.1 280 / 0.97) 100%)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        boxShadow: "0 4px 24px oklch(0.34 0.13 333 / 0.45)",
        borderBottom: "1px solid oklch(0.92 0.18 125 / 0.25)",
        animation: "installBannerIn 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards",
        direction: "rtl",
        fontFamily: "Heebo, Rubik, system-ui, sans-serif",
        color: "#fff",
      }}
    >
      <style>{`
        @keyframes installBannerIn {
          from { opacity: 0; transform: translateY(-100%); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Icon */}
      <span
        className="flex-shrink-0 flex items-center justify-center rounded-full"
        style={{
          width: 40,
          height: 40,
          background: "oklch(0.92 0.18 125)",
          color: "oklch(0.25 0.08 320)",
        }}
      >
        <Download size={18} strokeWidth={2.4} />
      </span>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p style={{ margin: 0, fontWeight: 700, fontSize: "0.9rem", lineHeight: 1.3 }}>
          הוסף לדף הבית
        </p>
        <p style={{ margin: "3px 0 0", fontSize: "0.77rem", opacity: 0.82, lineHeight: 1.4 }}>
          התקן את האפליקציה לחוויית שימוש מושלמת ומהירה
        </p>

        <button
          onClick={onInstall}
          style={{
            marginTop: 9,
            padding: "7px 18px",
            borderRadius: 999,
            background: "oklch(0.92 0.18 125)",
            color: "oklch(0.25 0.08 320)",
            fontWeight: 700,
            fontSize: "0.82rem",
            border: "none",
            cursor: "pointer",
          }}
        >
          התקן עכשיו
        </button>
      </div>

      {/* Dismiss */}
      <button
        aria-label="סגור"
        onClick={onDismiss}
        style={{
          flexShrink: 0,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "rgba(255,255,255,0.65)",
          padding: 4,
          lineHeight: 1,
          alignSelf: "flex-start",
        }}
      >
        <X size={18} />
      </button>
    </div>
  );
}

interface IosSheetProps {
  onDismiss: () => void;
}

function IosSheet({ onDismiss }: IosSheetProps) {
  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onDismiss}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9997,
          background: "oklch(0.1 0.04 300 / 0.45)",
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
          animation: "iosBackdropIn 0.3s ease forwards",
        }}
      />
      <style>{`
        @keyframes iosBackdropIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes iosSheetIn {
          from { opacity: 0; transform: translateY(100%); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Bottom sheet */}
      <div
        role="dialog"
        aria-label="הוסף למסך הבית"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 9998,
          borderRadius: "20px 20px 0 0",
          padding: "20px 20px max(20px, env(safe-area-inset-bottom))",
          background: "linear-gradient(160deg, oklch(0.18 0.06 300 / 0.98) 0%, oklch(0.14 0.04 290 / 0.98) 100%)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          boxShadow: "0 -8px 40px oklch(0.34 0.13 333 / 0.5)",
          borderTop: "1px solid oklch(0.92 0.18 125 / 0.2)",
          color: "#fff",
          direction: "rtl",
          fontFamily: "Heebo, Rubik, system-ui, sans-serif",
          animation: "iosSheetIn 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards",
        }}
      >
        {/* Drag handle */}
        <div
          style={{
            width: 40,
            height: 4,
            borderRadius: 99,
            background: "oklch(0.6 0.04 300 / 0.5)",
            margin: "0 auto 16px",
          }}
        />

        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 38,
                height: 38,
                borderRadius: "50%",
                background: "oklch(0.92 0.18 125)",
                color: "oklch(0.25 0.08 320)",
                flexShrink: 0,
              }}
            >
              <Share size={17} strokeWidth={2.4} />
            </span>
            <p style={{ margin: 0, fontWeight: 700, fontSize: "1rem" }}>הוסף למסך הבית</p>
          </div>
          <button
            aria-label="סגור"
            onClick={onDismiss}
            style={{
              background: "oklch(0.6 0.04 300 / 0.35)",
              border: "none",
              borderRadius: "50%",
              cursor: "pointer",
              color: "rgba(255,255,255,0.75)",
              width: 30,
              height: 30,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Instructions */}
        <div
          style={{
            background: "oklch(0.92 0.18 125 / 0.1)",
            border: "1px solid oklch(0.92 0.18 125 / 0.2)",
            borderRadius: 14,
            padding: "14px 16px",
          }}
        >
          <p style={{ margin: 0, fontSize: "0.88rem", lineHeight: 1.7, opacity: 0.92 }}>
            התקן את האפליקציה לחוויית שימוש מושלמת.
            <br />
            לחץ על כפתור השיתוף{" "}
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                verticalAlign: "middle",
                fontSize: "1.1em",
              }}
            >
              📤
            </span>{" "}
            בתחתית המסך, ולאחר מכן בחר ב-{" "}
            <strong style={{ color: "oklch(0.92 0.18 125)" }}>'הוסף למסך הבית'</strong>{" "}
            <span style={{ opacity: 0.75 }}>(+)</span>.
          </p>
        </div>

        {/* Arrow indicator pointing down toward Safari toolbar */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginTop: 12,
            opacity: 0.55,
            fontSize: "1.4rem",
            animation: "arrowBounce 1.4s ease-in-out infinite",
          }}
        >
          ↓
        </div>
        <style>{`
          @keyframes arrowBounce {
            0%, 100% { transform: translateY(0); }
            50%       { transform: translateY(5px); }
          }
        `}</style>
      </div>
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function InstallAppPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showAndroid, setShowAndroid] = useState(false);
  const [showIos, setShowIos] = useState(false);

  useEffect(() => {
    // Never show if already installed or user dismissed before
    if (isStandalone() || wasDismissed()) return;

    // ── Android / Chrome ──────────────────────────────────────────────────────
    const handleBip = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowAndroid(true);
    };

    window.addEventListener("beforeinstallprompt", handleBip);

    // ── iOS Safari ────────────────────────────────────────────────────────────
    if (isIosSafari()) {
      // Small delay so it doesn't immediately overlay on page load
      const t = setTimeout(() => setShowIos(true), 2500);
      return () => {
        window.removeEventListener("beforeinstallprompt", handleBip);
        clearTimeout(t);
      };
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBip);
    };
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleAndroidInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted" || outcome === "dismissed") {
      markDismissed();
      setShowAndroid(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    markDismissed();
    setShowAndroid(false);
    setShowIos(false);
  };

  if (showAndroid) {
    return <AndroidBanner onInstall={handleAndroidInstall} onDismiss={handleDismiss} />;
  }

  if (showIos) {
    return <IosSheet onDismiss={handleDismiss} />;
  }

  return null;
}
