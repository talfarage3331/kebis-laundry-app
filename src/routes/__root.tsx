import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useLocation,
  useNavigate,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { LaundryProvider, useLaundry } from "@/lib/laundry-store";
import { Loader2 } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { AccessibilityWidget } from "@/components/AccessibilityWidget";
import { PushNotificationPrompt } from "@/components/PushNotificationPrompt";
import { InstallAppPrompt } from "@/components/InstallAppPrompt";
import { useAppBadge } from "@/hooks/use-app-badge";
import { PwaTopSpacer } from "@/components/PwaTopSpacer";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">הדף לא נמצא</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
          >
            חזרה לבית
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">שגיאה בטעינה</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
        >
          נסה שוב
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover",
      },
      { title: "כביסה — שירות כביסה פרימיום" },
      { name: "description", content: "אפליקציית כביסה פרטית פרימיום — איסוף, מעקב ותשלום בלחיצה" },
      // PWA + iOS meta
      { name: "theme-color", content: "#6B1D5C" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "כביסה" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800&display=swap",
      },
      // PWA manifest
      { rel: "manifest", href: "/manifest.json" },
      // iOS splash / touch icons
      { rel: "apple-touch-icon", href: "/icon-192.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

/**
 * Inline script injected into <head> before any CSS renders.
 * Reads the iOS safe-area-inset-top via a temporary element and exposes it
 * as --sat on :root, enabling all pt-safe-* utilities to work reliably
 * even on the very first paint in PWA standalone mode.
 */
const SAFE_AREA_SCRIPT = `
(function() {
  var isStandalone = window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  if (!isStandalone) return;
  // Read env(safe-area-inset-top) via a tiny off-screen element
  var el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:0;left:0;right:0;height:env(safe-area-inset-top,47px);pointer-events:none;visibility:hidden';
  document.documentElement.appendChild(el);
  var h = el.getBoundingClientRect().height || 47;
  el.remove();
  document.documentElement.style.setProperty('--sat', h + 'px');
  document.documentElement.setAttribute('data-standalone', 'true');
})();
`;

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <HeadContent />
        {/* Must be synchronous and first so --sat is available before first paint */}
        <script dangerouslySetInnerHTML={{ __html: SAFE_AREA_SCRIPT }} />
      </head>
      <body>
        {/* Global PWA status-bar spacer — primary color, zero height in browser */}
        <PwaTopSpacer color="var(--primary)" />
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  // Detect standalone PWA mode — update CSS var if JS runs after initial script
  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone) {
      document.documentElement.setAttribute("data-standalone", "true");
      // Re-measure in case the inline script ran before iOS applied safe areas
      const el = document.createElement("div");
      el.style.cssText =
        "position:fixed;top:0;left:0;right:0;height:env(safe-area-inset-top,47px);pointer-events:none;visibility:hidden";
      document.documentElement.appendChild(el);
      const h = el.getBoundingClientRect().height || 47;
      el.remove();
      document.documentElement.style.setProperty("--sat", `${h}px`);
      console.log(`[PWA] Standalone mode, safe-area-top=${h}px`);
    }
  }, []);

  // Handle PWA automatic updates and badge clearing
  useEffect(() => {
    const clearBadge = () => {
      if ("clearAppBadge" in navigator) {
        navigator.clearAppBadge().catch((err) => {
          console.error("Failed to clear app badge:", err);
        });
      }
    };

    const updateServiceWorker = () => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.ready
          .then((registration) => {
            console.log("[PWA] Checking for service worker updates...");
            return registration.update();
          })
          .catch((err) => {
            console.warn("[PWA] Service worker update check failed:", err);
          });
      }
    };

    // Initial check and badge clear on mount
    clearBadge();
    updateServiceWorker();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        clearBadge();
        updateServiceWorker();
      }
    };

    const handleFocus = () => {
      clearBadge();
      updateServiceWorker();
    };

    const handleControllerChange = () => {
      console.log(
        "[PWA] Controller changed (newer service worker active). Reloading page smoothly...",
      );
      window.location.reload();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    }

    // Check for updates periodically in the background (every 5 minutes)
    const updateInterval = setInterval(updateServiceWorker, 5 * 60 * 1000);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      }
      clearInterval(updateInterval);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <LaundryProvider>
        <AppBadgeBridge />
        <RoleRouteGuard>
          <Outlet />
        </RoleRouteGuard>
        <Toaster position="top-center" richColors />
        <AccessibilityWidget />
        <PushNotificationPrompt />
        <InstallAppPrompt />
      </LaundryProvider>
    </QueryClientProvider>
  );
}

function RoleRouteGuard({ children }: { children: React.ReactNode }) {
  const { user, isProfileReady, role, isRoleLoading } = useLaundry();

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Wait until BOTH Firebase Auth AND Firestore role are resolved
    if (!isProfileReady || isRoleLoading) return;

    const path = location.pathname;

    // Define customer-only paths
    const isCustomerPath = ["/", "/chat", "/delivery", "/payments", "/tracking"].includes(path);
    // Define laundry-only paths
    const isLaundryPath = ["/laundry-dashboard", "/admin-chat"].includes(path);
    // Define admin-only paths
    const isAdminPath = ["/admin"].includes(path);

    if (user) {
      const currentRole = user.role || role || "customer";

      if (currentRole === "laundry") {
        if (isCustomerPath || isAdminPath) {
          navigate({ to: "/laundry-dashboard", replace: true });
        }
      } else if (currentRole === "admin") {
        if (isCustomerPath) {
          navigate({ to: "/admin", replace: true });
        }
      } else {
        // Customer
        if (isAdminPath || isLaundryPath) {
          navigate({ to: "/", replace: true });
        }
      }
    } else {
      // Guest
      const isPublicPath = ["/login", "/signup", "/"].includes(path) || path.startsWith("/shop/");
      if (!isPublicPath) {
        navigate({ to: "/login", replace: true });
      }
    }
  }, [user, isProfileReady, role, isRoleLoading, location.pathname, navigate]);

  // Block all rendering until both Firebase Auth and Firestore role are confirmed
  if (!isProfileReady || isRoleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="size-10 text-primary animate-spin" />
      </div>
    );
  }

  const path = location.pathname;
  const isCustomerPath = ["/", "/chat", "/delivery", "/payments", "/tracking"].includes(path);
  const isLaundryPath = ["/laundry-dashboard", "/admin-chat"].includes(path);
  const isAdminPath = ["/admin"].includes(path);

  if (user) {
    const currentRole = user.role || role || "customer";
    if (currentRole === "laundry" && (isCustomerPath || isAdminPath)) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="size-10 text-primary animate-spin" />
        </div>
      );
    }
    if (currentRole === "admin" && isCustomerPath) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="size-10 text-primary animate-spin" />
        </div>
      );
    }
    if (currentRole === "customer" && (isAdminPath || isLaundryPath)) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="size-10 text-primary animate-spin" />
        </div>
      );
    }
  } else {
    const isPublicPath = ["/login", "/signup", "/"].includes(path) || path.startsWith("/shop/");
    if (!isPublicPath) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="size-10 text-primary animate-spin" />
        </div>
      );
    }
  }

  return <>{children}</>;
}

function AppBadgeBridge() {
  useAppBadge();
  return null;
}
