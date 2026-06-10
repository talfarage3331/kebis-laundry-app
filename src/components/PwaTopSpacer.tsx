/**
 * PwaTopSpacer
 *
 * A fixed-position colored overlay that covers the iOS/Android native status
 * bar area when the app runs in PWA standalone mode (installed to home screen).
 *
 * HOW IT WORKS
 * ────────────
 * With `apple-mobile-web-app-status-bar-style: black-translucent`, iOS renders
 * the app edge-to-edge beneath the status bar. The status bar becomes
 * transparent, so the app content shows through — but buttons behind the clock
 * and battery icons are unreachable.
 *
 * This component renders a fixed <div> whose height exactly equals the iOS
 * safe-area-inset-top (≈47px on Face ID iPhones, ≈20px on older models).
 * The height comes from the --sat CSS variable set by the inline script in
 * __root.tsx, with env(safe-area-inset-top) and 47px as cascading fallbacks.
 *
 * The overlay sits at z-index 9999 so it is always on top of app content,
 * effectively "blocking off" the status-bar area and giving it the right
 * background color (matching the top section of each page).
 *
 * RESULT
 * ──────
 * - Status bar area gets the primary purple background → looks part of the app.
 * - All header content (back arrows, titles) is pushed BELOW the status bar.
 * - Regular Safari / desktop: component renders null → zero impact.
 */

import { useEffect, useState } from "react";

type PwaTopSpacerProps = {
  /** CSS color value that matches the top section background of the page. */
  color?: string;
};

export function PwaTopSpacer({ color = "var(--primary)" }: PwaTopSpacerProps) {
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);
  }, []);

  if (!isStandalone) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        // --sat is set synchronously by the inline script in __root.tsx
        // env(safe-area-inset-top, 47px) is the CSS-native fallback
        // 47px is the hard fallback for older browsers / edge cases
        height: "var(--sat, env(safe-area-inset-top, 47px))",
        background: color,
        zIndex: 9999,
        pointerEvents: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    />
  );
}
