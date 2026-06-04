/**
 * AccessibilityWidget.tsx
 * ──────────────────────
 * A fully accessible, WCAG 2.1 AA compliant floating widget that lets users
 * adjust text size, contrast, link styling, and font readability.
 *
 * Key accessibility logic:
 *  - Focus trap inside the panel when open (Tab / Shift+Tab cycles through controls)
 *  - Escape key closes the panel and returns focus to the FAB trigger
 *  - All interactive elements have ARIA labels in Hebrew
 *  - The panel is role="dialog" with aria-modal for screen readers
 *  - Settings persist in localStorage across page reloads
 *  - CSS classes are applied to <html> element for global cascade
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface A11ySettings {
  /** Font-size scale factor: 1.0 = 100%, max 2.0 = 200% */
  fontScale: number;
  /** "normal" | "high-contrast" | "monochrome" */
  contrastMode: "normal" | "high-contrast" | "monochrome";
  /** Underline all links */
  linksUnderline: boolean;
  /** Use a highly legible sans-serif font */
  readableFont: boolean;
}

const DEFAULT_SETTINGS: A11ySettings = {
  fontScale: 1.0,
  contrastMode: "normal",
  linksUnderline: false,
  readableFont: false,
};

const STORAGE_KEY = "kebisa_a11y_settings";
const MIN_SCALE = 0.85;
const MAX_SCALE = 2.0;
const SCALE_STEP = 0.15;

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadSettings(): A11ySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch { /* ignore corrupt data */ }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(s: A11ySettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch { /* storage full — fail silently */ }
}

/**
 * Apply settings as CSS classes / variables on <html> so they cascade globally.
 * Using classes avoids conflicts and makes it trivial to undo.
 */
function applyToDOM(s: A11ySettings) {
  const root = document.documentElement;

  // 1. Font scale → set direct percent font-size on the root element
  const textSize = Math.round(s.fontScale * 100);
  root.style.fontSize = `${textSize}%`;

  // 2. Contrast mode classes
  root.classList.toggle("a11y-high-contrast", s.contrastMode === "high-contrast");
  root.classList.toggle("a11y-monochrome", s.contrastMode === "monochrome");

  // 3. Links underline
  root.classList.toggle("a11y-links-underline", s.linksUnderline);

  // 4. Readable font
  root.classList.toggle("a11y-readable-font", s.readableFont);
}

// ─── Component ──────────────────────────────────────────────────────────────

export function AccessibilityWidget() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<A11ySettings>(DEFAULT_SETTINGS);
  const [isMobile, setIsMobile] = useState(false);

  // Refs for focus management
  const fabRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLButtonElement>(null);

  // ── Responsive breakpoint detection ──
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 640px)");
    const handler = (e: MediaQueryListEvent | MediaQueryList) => setIsMobile(e.matches);
    handler(mql);
    mql.addEventListener("change", handler as (e: MediaQueryListEvent) => void);
    return () => mql.removeEventListener("change", handler as (e: MediaQueryListEvent) => void);
  }, []);

  // ── Load persisted settings on mount ──
  useEffect(() => {
    const s = loadSettings();
    setSettings(s);
    applyToDOM(s);
  }, []);

  // ── Apply text size state globally to the root HTML element ──
  useEffect(() => {
    const textSize = Math.round(settings.fontScale * 100);
    document.documentElement.style.fontSize = `${textSize}%`;
  }, [settings.fontScale]);

  // ── Update helper — persists + applies to DOM ──
  const update = useCallback((patch: Partial<A11ySettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      applyToDOM(next);
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    const fresh = { ...DEFAULT_SETTINGS };
    setSettings(fresh);
    saveSettings(fresh);
    applyToDOM(fresh);
  }, []);

  // ── Toggle open / close with focus management ──
  const toggleOpen = useCallback(() => {
    setOpen((prev) => {
      if (!prev) {
        // Opening — focus the first control after render
        requestAnimationFrame(() => {
          firstFocusableRef.current?.focus();
        });
      }
      return !prev;
    });
  }, []);

  const closePanel = useCallback(() => {
    setOpen(false);
    // Return focus to the FAB trigger per WCAG focus-return guideline
    requestAnimationFrame(() => fabRef.current?.focus());
  }, []);

  // ── Escape key handler ──
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closePanel();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closePanel]);

  // ── Focus trap inside the panel ──
  useEffect(() => {
    if (!open || !panelRef.current) return;

    const panel = panelRef.current;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      const focusable = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    panel.addEventListener("keydown", onKeyDown);
    return () => panel.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // ── Lock body scroll when mobile sheet is open ──
  useEffect(() => {
    if (open && isMobile) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [open, isMobile]);

  // ── Contrast mode label helper ──
  const contrastLabel = (mode: A11ySettings["contrastMode"]) => {
    switch (mode) {
      case "normal": return "רגיל";
      case "high-contrast": return "ניגודיות גבוהה";
      case "monochrome": return "שחור-לבן";
    }
  };

  const scalePercent = Math.round(settings.fontScale * 100);

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════

  return (
    <>
      {/* ── Inline styles — injected once, scoped via unique class prefixes ── */}
      <style>{a11yCSS}</style>

      {/* ── Dynamic scale overrides ── */}
      <style dangerouslySetInnerHTML={{ __html: `
        /* Dynamic scaling for root and form elements */
        html {
          font-size: ${scalePercent}% !important;
        }
        
        /* Force inputs, selects, and textareas to scale from their base 16px (overriding styles.css fixed px) */
        input, select, textarea {
          font-size: calc(16px * ${settings.fontScale}) !important;
        }
        
        /* Ensure buttons inherit scaled font sizes if they don't have explicit utility overrides */
        button {
          font-size: inherit;
        }
      ` }} />

      {/* ── FAB Trigger Button ── */}
      <button
        ref={fabRef}
        onClick={toggleOpen}
        aria-label={open ? "סגור תפריט נגישות" : "פתח תפריט נגישות"}
        aria-expanded={open}
        aria-controls="a11y-panel"
        className="a11y-fab"
        type="button"
      >
        {/* Universal accessibility icon */}
        <svg
          className="a11y-fab__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="4.5" r="2.5" />
          <path d="M12 7v5" />
          <path d="M8 11l4 1 4-1" />
          <path d="M10 21l2-9 2 9" />
          <path d="M8 21h8" />
        </svg>
        {/* Subtle pulsing ring */}
        <span className="a11y-fab__ring" aria-hidden="true" />
      </button>

      {/* ── Backdrop (mobile only) ── */}
      {open && isMobile && (
        <div
          className="a11y-backdrop"
          onClick={closePanel}
          aria-hidden="true"
        />
      )}

      {/* ── Panel (dialog) ── */}
      {open && (
        <div
          ref={panelRef}
          id="a11y-panel"
          role="dialog"
          aria-modal="true"
          aria-label="הגדרות נגישות"
          className={`a11y-panel ${isMobile ? "a11y-panel--mobile" : "a11y-panel--desktop"}`}
        >
          {/* ── Header ── */}
          <div className="a11y-panel__header">
            <div className="a11y-panel__header-text">
              <svg className="a11y-panel__header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="4.5" r="2.5" />
                <path d="M12 7v5" />
                <path d="M8 11l4 1 4-1" />
                <path d="M10 21l2-9 2 9" />
                <path d="M8 21h8" />
              </svg>
              <h2 id="a11y-title">הגדרות נגישות</h2>
            </div>
            <button
              ref={firstFocusableRef}
              onClick={closePanel}
              aria-label="סגור תפריט נגישות"
              className="a11y-panel__close"
              type="button"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* ── Mobile drag handle ── */}
          {isMobile && <div className="a11y-panel__drag-handle" aria-hidden="true" />}

          {/* ── Controls ── */}
          <div className="a11y-panel__body">

            {/* ─ 1. Text Size ─ */}
            <div className="a11y-control" role="group" aria-label="גודל טקסט">
              <div className="a11y-control__label-row">
                <span className="a11y-control__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>
                </span>
                <span className="a11y-control__label">גודל טקסט</span>
                <span className="a11y-control__value">{scalePercent}%</span>
              </div>
              <div className="a11y-size-controls">
                <button
                  onClick={() => update({ fontScale: Math.max(MIN_SCALE, +(settings.fontScale - SCALE_STEP).toFixed(2)) })}
                  disabled={settings.fontScale <= MIN_SCALE}
                  aria-label="הקטן טקסט"
                  className="a11y-size-btn"
                  type="button"
                >
                  <span aria-hidden="true">A−</span>
                </button>
                {/* Visual scale bar */}
                <div className="a11y-size-track" role="presentation" aria-hidden="true">
                  <div
                    className="a11y-size-fill"
                    style={{ width: `${((settings.fontScale - MIN_SCALE) / (MAX_SCALE - MIN_SCALE)) * 100}%` }}
                  />
                </div>
                <button
                  onClick={() => update({ fontScale: Math.min(MAX_SCALE, +(settings.fontScale + SCALE_STEP).toFixed(2)) })}
                  disabled={settings.fontScale >= MAX_SCALE}
                  aria-label="הגדל טקסט"
                  className="a11y-size-btn"
                  type="button"
                >
                  <span aria-hidden="true">A+</span>
                </button>
              </div>
            </div>

            {/* ─ 2. Contrast Mode ─ */}
            <div className="a11y-control" role="group" aria-label="מצב ניגודיות">
              <div className="a11y-control__label-row">
                <span className="a11y-control__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor" opacity="0.35"/></svg>
                </span>
                <span className="a11y-control__label">ניגודיות</span>
                <span className="a11y-control__value">{contrastLabel(settings.contrastMode)}</span>
              </div>
              <div className="a11y-contrast-btns">
                {(["normal", "high-contrast", "monochrome"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => update({ contrastMode: mode })}
                    aria-pressed={settings.contrastMode === mode}
                    className={`a11y-contrast-btn ${settings.contrastMode === mode ? "a11y-contrast-btn--active" : ""}`}
                    type="button"
                  >
                    <span
                      className={`a11y-contrast-preview a11y-contrast-preview--${mode}`}
                      aria-hidden="true"
                    />
                    <span>{contrastLabel(mode)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ─ 3. Links Underline Toggle ─ */}
            <button
              onClick={() => update({ linksUnderline: !settings.linksUnderline })}
              aria-pressed={settings.linksUnderline}
              className={`a11y-toggle ${settings.linksUnderline ? "a11y-toggle--active" : ""}`}
              type="button"
            >
              <span className="a11y-toggle__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 7h10v0a5 5 0 0 1-10 0z" fill="currentColor" opacity="0.2"/><path d="M7 7h10"/><path d="M12 7v6a3 3 0 0 1-6 0"/><path d="M12 7v6a3 3 0 0 0 6 0"/><line x1="5" y1="21" x2="19" y2="21"/></svg>
              </span>
              <div className="a11y-toggle__text">
                <span className="a11y-toggle__label">הדגשת קישורים</span>
                <span className="a11y-toggle__desc">קו תחתון לכל הקישורים</span>
              </div>
              <span className={`a11y-toggle__switch ${settings.linksUnderline ? "a11y-toggle__switch--on" : ""}`} aria-hidden="true">
                <span className="a11y-toggle__switch-thumb" />
              </span>
            </button>

            {/* ─ 4. Readable Font Toggle ─ */}
            <button
              onClick={() => update({ readableFont: !settings.readableFont })}
              aria-pressed={settings.readableFont}
              className={`a11y-toggle ${settings.readableFont ? "a11y-toggle--active" : ""}`}
              type="button"
            >
              <span className="a11y-toggle__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>
              </span>
              <div className="a11y-toggle__text">
                <span className="a11y-toggle__label">גופן קריא</span>
                <span className="a11y-toggle__desc">החלפה לגופן ברור וקריא</span>
              </div>
              <span className={`a11y-toggle__switch ${settings.readableFont ? "a11y-toggle__switch--on" : ""}`} aria-hidden="true">
                <span className="a11y-toggle__switch-thumb" />
              </span>
            </button>

            {/* ─ 5. Reset ─ */}
            <button
              onClick={resetAll}
              className="a11y-reset"
              aria-label="איפוס כל הגדרות הנגישות"
              type="button"
            >
              <svg className="a11y-reset__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
              <span>איפוס הגדרות</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Styles (injected inline to keep the widget self-contained) ─────────────
// Uses scoped class names to avoid collisions with the app's Tailwind classes.

const a11yCSS = `
/* ═══════════════════════════════════════════════════════════
   ACCESSIBILITY WIDGET — Self-contained styles
   ═══════════════════════════════════════════════════════════ */

/* ── Global overrides applied via <html> classes ────────── */

/* Font scaling — now handled directly on document.documentElement style */

/* High-contrast mode */
html.a11y-high-contrast {
  filter: none !important;
}
html.a11y-high-contrast body {
  background-color: #0a0a0a !important;
  color: #ffe066 !important;
}
html.a11y-high-contrast * {
  border-color: #ffe066 !important;
}
html.a11y-high-contrast a,
html.a11y-high-contrast button {
  color: #ffffff !important;
}
html.a11y-high-contrast .a11y-fab,
html.a11y-high-contrast .a11y-panel {
  /* Keep widget readable in HC mode */
  color: initial;
}

/* Monochrome (grayscale) mode */
html.a11y-monochrome {
  filter: grayscale(1);
}

/* Links underline */
html.a11y-links-underline a {
  text-decoration: underline !important;
  text-underline-offset: 3px !important;
  text-decoration-thickness: 2px !important;
}

/* Readable font — override the site's Hebrew font stack */
html.a11y-readable-font,
html.a11y-readable-font body,
html.a11y-readable-font * {
  font-family: "Segoe UI", "Arial", "Helvetica Neue", Helvetica, sans-serif !important;
  letter-spacing: 0.02em !important;
  word-spacing: 0.05em !important;
}

/* ── FAB (Floating Action Button) ──────────────────────── */

.a11y-fab {
  position: fixed;
  bottom: 120px;
  left: 18px;
  z-index: 9998;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, #6B1D5C 0%, #9b3fa0 100%);
  color: #fff;
  box-shadow:
    0 4px 20px rgba(107, 29, 92, 0.35),
    0 0 0 3px rgba(107, 29, 92, 0.08);
  transition: transform 0.25s cubic-bezier(.34,1.56,.64,1),
              box-shadow 0.25s ease;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
.a11y-fab:hover {
  transform: scale(1.1);
  box-shadow:
    0 6px 28px rgba(107, 29, 92, 0.45),
    0 0 0 4px rgba(107, 29, 92, 0.12);
}
.a11y-fab:focus-visible {
  outline: 3px solid #ffe066;
  outline-offset: 3px;
}
.a11y-fab:active {
  transform: scale(0.95);
}

.a11y-fab__icon {
  width: 26px;
  height: 26px;
  position: relative;
  z-index: 1;
}

/* Subtle animated ring around FAB */
.a11y-fab__ring {
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 2px solid rgba(107, 29, 92, 0.25);
  animation: a11yPulse 3s ease-in-out infinite;
  pointer-events: none;
}

@keyframes a11yPulse {
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.15); opacity: 0; }
}

/* ── Backdrop (mobile) ─────────────────────────────────── */

.a11y-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9998;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  animation: a11yFadeIn 0.2s ease;
}

@keyframes a11yFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* ── Panel (shared) ────────────────────────────────────── */

.a11y-panel {
  position: fixed;
  z-index: 9999;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(107, 29, 92, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  direction: rtl;
  font-family: "Heebo", "Rubik", system-ui, sans-serif;
}

/* Desktop: popover above FAB */
.a11y-panel--desktop {
  bottom: 180px;
  left: 18px;
  width: 340px;
  max-height: calc(100vh - 200px);
  border-radius: 20px;
  box-shadow:
    0 20px 60px -10px rgba(0, 0, 0, 0.18),
    0 0 0 1px rgba(107, 29, 92, 0.06);
  animation: a11ySlideUpDesktop 0.3s cubic-bezier(.34,1.56,.64,1);
}

@keyframes a11ySlideUpDesktop {
  from { opacity: 0; transform: translateY(12px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

/* Mobile: bottom sheet */
.a11y-panel--mobile {
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  max-height: 85vh;
  border-radius: 24px 24px 0 0;
  box-shadow: 0 -10px 50px -10px rgba(0, 0, 0, 0.22);
  animation: a11ySlideUpMobile 0.35s cubic-bezier(.34,1.56,.64,1);
}

@keyframes a11ySlideUpMobile {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}

/* ── Panel Header ──────────────────────────────────────── */

.a11y-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid rgba(107, 29, 92, 0.06);
}

.a11y-panel__header-text {
  display: flex;
  align-items: center;
  gap: 10px;
}

.a11y-panel__header-icon {
  width: 22px;
  height: 22px;
  color: #6B1D5C;
  flex-shrink: 0;
}

.a11y-panel__header h2 {
  font-size: 15px;
  font-weight: 800;
  color: #1a1a2e;
  margin: 0;
  line-height: 1;
}

.a11y-panel__close {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: none;
  background: rgba(107, 29, 92, 0.06);
  color: #6B1D5C;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: background 0.15s, transform 0.15s;
  -webkit-tap-highlight-color: transparent;
}
.a11y-panel__close:hover {
  background: rgba(107, 29, 92, 0.12);
}
.a11y-panel__close:active {
  transform: scale(0.9);
}
.a11y-panel__close:focus-visible {
  outline: 2px solid #6B1D5C;
  outline-offset: 2px;
}
.a11y-panel__close svg {
  width: 16px;
  height: 16px;
}

/* Mobile drag handle bar */
.a11y-panel__drag-handle {
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: rgba(0, 0, 0, 0.12);
  margin: -4px auto 4px;
}

/* ── Panel Body (scrollable) ───────────────────────────── */

.a11y-panel__body {
  padding: 12px 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

/* ── Control group wrapper ─────────────────────────────── */

.a11y-control {
  background: rgba(107, 29, 92, 0.03);
  border: 1px solid rgba(107, 29, 92, 0.06);
  border-radius: 14px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.a11y-control__label-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.a11y-control__icon {
  width: 18px;
  height: 18px;
  color: #6B1D5C;
  flex-shrink: 0;
}
.a11y-control__icon svg {
  width: 18px;
  height: 18px;
}

.a11y-control__label {
  font-size: 13px;
  font-weight: 700;
  color: #1a1a2e;
  flex: 1;
}

.a11y-control__value {
  font-size: 12px;
  font-weight: 800;
  color: #6B1D5C;
  background: rgba(107, 29, 92, 0.08);
  padding: 2px 10px;
  border-radius: 8px;
  min-width: 44px;
  text-align: center;
}

/* ── Text size stepper + track ─────────────────────────── */

.a11y-size-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.a11y-size-btn {
  width: 40px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid rgba(107, 29, 92, 0.12);
  background: #fff;
  color: #6B1D5C;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: all 0.15s;
  -webkit-tap-highlight-color: transparent;
}
.a11y-size-btn:hover:not(:disabled) {
  background: rgba(107, 29, 92, 0.08);
  border-color: #6B1D5C;
}
.a11y-size-btn:active:not(:disabled) {
  transform: scale(0.92);
}
.a11y-size-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.a11y-size-btn:focus-visible {
  outline: 2px solid #6B1D5C;
  outline-offset: 2px;
}

.a11y-size-track {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: rgba(107, 29, 92, 0.08);
  overflow: hidden;
}

.a11y-size-fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, #6B1D5C, #9b3fa0);
  transition: width 0.25s ease;
}

/* ── Contrast mode buttons ─────────────────────────────── */

.a11y-contrast-btns {
  display: flex;
  gap: 6px;
}

.a11y-contrast-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 8px 4px;
  border-radius: 10px;
  border: 1.5px solid rgba(107, 29, 92, 0.08);
  background: #fff;
  cursor: pointer;
  font-size: 10px;
  font-weight: 700;
  color: #1a1a2e;
  transition: all 0.2s;
  -webkit-tap-highlight-color: transparent;
}
.a11y-contrast-btn:hover {
  border-color: rgba(107, 29, 92, 0.2);
  background: rgba(107, 29, 92, 0.03);
}
.a11y-contrast-btn--active {
  border-color: #6B1D5C !important;
  background: rgba(107, 29, 92, 0.06) !important;
  box-shadow: 0 0 0 2px rgba(107, 29, 92, 0.1);
}
.a11y-contrast-btn:focus-visible {
  outline: 2px solid #6B1D5C;
  outline-offset: 2px;
}

.a11y-contrast-preview {
  width: 28px;
  height: 20px;
  border-radius: 5px;
  border: 1px solid rgba(0,0,0,0.08);
}
.a11y-contrast-preview--normal {
  background: linear-gradient(135deg, #fff 50%, #f0f0f0 50%);
}
.a11y-contrast-preview--high-contrast {
  background: linear-gradient(135deg, #0a0a0a 50%, #ffe066 50%);
}
.a11y-contrast-preview--monochrome {
  background: linear-gradient(135deg, #888 50%, #ccc 50%);
}

/* ── Toggle buttons (links underline, readable font) ──── */

.a11y-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(107, 29, 92, 0.06);
  background: rgba(107, 29, 92, 0.02);
  cursor: pointer;
  transition: all 0.2s;
  text-align: right;
  width: 100%;
  -webkit-tap-highlight-color: transparent;
}
.a11y-toggle:hover {
  background: rgba(107, 29, 92, 0.05);
  border-color: rgba(107, 29, 92, 0.12);
}
.a11y-toggle--active {
  background: rgba(107, 29, 92, 0.06) !important;
  border-color: rgba(107, 29, 92, 0.15) !important;
}
.a11y-toggle:focus-visible {
  outline: 2px solid #6B1D5C;
  outline-offset: 2px;
}

.a11y-toggle__icon {
  width: 20px;
  height: 20px;
  color: #6B1D5C;
  flex-shrink: 0;
}
.a11y-toggle__icon svg {
  width: 20px;
  height: 20px;
}

.a11y-toggle__text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.a11y-toggle__label {
  font-size: 13px;
  font-weight: 700;
  color: #1a1a2e;
}

.a11y-toggle__desc {
  font-size: 10.5px;
  font-weight: 500;
  color: #888;
}

/* Custom toggle switch */
.a11y-toggle__switch {
  width: 40px;
  height: 22px;
  border-radius: 11px;
  background: rgba(0, 0, 0, 0.1);
  position: relative;
  flex-shrink: 0;
  transition: background 0.25s ease;
}
.a11y-toggle__switch--on {
  background: #6B1D5C;
}
.a11y-toggle__switch-thumb {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,0.15);
  transition: transform 0.25s cubic-bezier(.34,1.56,.64,1);
}
.a11y-toggle__switch--on .a11y-toggle__switch-thumb {
  transform: translateX(-18px);
}

/* ── Reset button ──────────────────────────────────────── */

.a11y-reset {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  border-radius: 14px;
  border: 1.5px dashed rgba(107, 29, 92, 0.15);
  background: transparent;
  color: #6B1D5C;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
  margin-top: 4px;
  -webkit-tap-highlight-color: transparent;
}
.a11y-reset:hover {
  background: rgba(107, 29, 92, 0.04);
  border-color: #6B1D5C;
}
.a11y-reset:active {
  transform: scale(0.97);
}
.a11y-reset:focus-visible {
  outline: 2px solid #6B1D5C;
  outline-offset: 2px;
}
.a11y-reset__icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

/* ── High-contrast overrides for the widget itself ─────── */

html.a11y-high-contrast .a11y-panel {
  background: rgba(20, 20, 30, 0.97) !important;
  border-color: #ffe066 !important;
}
html.a11y-high-contrast .a11y-panel__header h2,
html.a11y-high-contrast .a11y-control__label,
html.a11y-high-contrast .a11y-toggle__label {
  color: #ffe066 !important;
}
html.a11y-high-contrast .a11y-control__value {
  background: rgba(255, 224, 102, 0.15) !important;
  color: #ffe066 !important;
}
html.a11y-high-contrast .a11y-control,
html.a11y-high-contrast .a11y-toggle {
  background: rgba(255, 255, 255, 0.04) !important;
  border-color: rgba(255, 224, 102, 0.2) !important;
}
html.a11y-high-contrast .a11y-size-btn {
  background: rgba(255, 224, 102, 0.1) !important;
  border-color: #ffe066 !important;
  color: #ffe066 !important;
}
html.a11y-high-contrast .a11y-contrast-btn {
  background: rgba(255, 255, 255, 0.05) !important;
  border-color: rgba(255, 224, 102, 0.2) !important;
  color: #ffe066 !important;
}
html.a11y-high-contrast .a11y-contrast-btn--active {
  border-color: #ffe066 !important;
  box-shadow: 0 0 0 2px rgba(255, 224, 102, 0.3) !important;
}
html.a11y-high-contrast .a11y-reset {
  border-color: #ffe066 !important;
  color: #ffe066 !important;
}
html.a11y-high-contrast .a11y-toggle__desc {
  color: rgba(255, 224, 102, 0.6) !important;
}
html.a11y-high-contrast .a11y-panel__close {
  background: rgba(255, 224, 102, 0.1) !important;
  color: #ffe066 !important;
}
html.a11y-high-contrast .a11y-toggle__switch {
  background: rgba(255, 224, 102, 0.15) !important;
}
html.a11y-high-contrast .a11y-toggle__switch--on {
  background: #ffe066 !important;
}
html.a11y-high-contrast .a11y-toggle__switch--on .a11y-toggle__switch-thumb {
  background: #0a0a0a !important;
}
html.a11y-high-contrast .a11y-fab {
  background: linear-gradient(135deg, #ffe066 0%, #ffd700 100%) !important;
  color: #0a0a0a !important;
  box-shadow: 0 4px 20px rgba(255, 224, 102, 0.4) !important;
}
html.a11y-high-contrast .a11y-fab__ring {
  border-color: rgba(255, 224, 102, 0.3) !important;
}

/* ── Ensure the widget is not affected by grayscale filter ── */
html.a11y-monochrome .a11y-fab,
html.a11y-monochrome .a11y-panel,
html.a11y-monochrome .a11y-backdrop {
  filter: none;
}

/* ── Responsive media query refinements ────────────────── */

@media (max-width: 640px) {
  .a11y-fab {
    bottom: 100px;
    left: 14px;
    width: 48px;
    height: 48px;
  }
  .a11y-fab__icon {
    width: 22px;
    height: 22px;
  }
  .a11y-panel__body {
    padding-bottom: calc(20px + env(safe-area-inset-bottom));
  }
}

/* ── Reduced motion preference ─────────────────────────── */

@media (prefers-reduced-motion: reduce) {
  .a11y-fab,
  .a11y-fab__ring,
  .a11y-panel--desktop,
  .a11y-panel--mobile,
  .a11y-backdrop,
  .a11y-toggle__switch-thumb,
  .a11y-size-fill {
    animation: none !important;
    transition-duration: 0.01ms !important;
  }
}
`;
