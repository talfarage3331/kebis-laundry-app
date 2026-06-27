/**
 * use-brand.ts
 *
 * Resolves a laundry vendor's brand assets (name, logo, color) from Firestore
 * given a URL slug. Results are cached in localStorage for 24 hours to avoid
 * redundant network trips on every page load.
 *
 * Firestore vendor document fields read:
 *   - businessName  : string  – display name
 *   - logoUrl       : string  – HTTPS URL of the vendor-uploaded logo
 *   - brandColor    : string  – hex color string, e.g. "#6B1D5C"
 *   - shopSlug      : string  – primary slug
 *   - slug          : string  – legacy alias
 */

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
} from "firebase/firestore";

// ── Types ──────────────────────────────────────────────────────────────────

export interface BrandAssets {
  brandName: string | null;
  brandLogoUrl: string | null;
  brandColor: string | null;
  isLoading: boolean;
}

interface CacheEntry {
  brandName: string | null;
  brandLogoUrl: string | null;
  brandColor: string | null;
  /** Unix-ms timestamp when this cache entry expires. */
  expiresAt: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── Helpers ────────────────────────────────────────────────────────────────

function cacheKey(slug: string) {
  return `brandCache_${slug}`;
}

function readCache(slug: string): CacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey(slug));
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() > entry.expiresAt) {
      localStorage.removeItem(cacheKey(slug));
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

function writeCache(slug: string, entry: Omit<CacheEntry, "expiresAt">) {
  if (typeof window === "undefined") return;
  try {
    const full: CacheEntry = { ...entry, expiresAt: Date.now() + CACHE_TTL_MS };
    localStorage.setItem(cacheKey(slug), JSON.stringify(full));
  } catch {
    // localStorage quota exceeded — silently ignore
  }
}

/**
 * Resolves a slug to vendor brand assets using three fallback strategies.
 * Returns null if nothing is found.
 */
async function fetchBrandAssets(
  slug: string,
): Promise<Omit<CacheEntry, "expiresAt"> | null> {
  if (!db) return null;

  const extract = (data: Record<string, any>): Omit<CacheEntry, "expiresAt"> => ({
    brandName:    data.businessName || data.fullName || data.name || null,
    brandLogoUrl: data.logoUrl || null,
    brandColor:   data.brandColor || null,
  });

  // Strategy 1 — shopSlug (primary)
  try {
    const snap = await getDocs(
      query(collection(db, "users"), where("shopSlug", "==", slug)),
    );
    if (!snap.empty) return extract(snap.docs[0].data());
  } catch (e) {
    console.error("[useBrand] Strategy 1 (shopSlug) failed:", e);
  }

  // Strategy 2 — slug (legacy alias)
  try {
    const snap = await getDocs(
      query(collection(db, "users"), where("slug", "==", slug)),
    );
    if (!snap.empty) return extract(snap.docs[0].data());
  } catch (e) {
    console.error("[useBrand] Strategy 2 (slug) failed:", e);
  }

  // Strategy 3 — direct Firestore document UID
  try {
    const snap = await getDoc(doc(db, "users", slug));
    if (snap.exists()) {
      const data = snap.data();
      if (data.role === "laundry" || data.role === "admin") return extract(data);
    }
  } catch (e) {
    console.error("[useBrand] Strategy 3 (direct UID) failed:", e);
  }

  return null;
}

// ── Hook ───────────────────────────────────────────────────────────────────

declare global {
  interface Window {
    __LAUNDRY_BRAND__?: {
      slug: string;
      brandName: string | null;
      brandLogoUrl: string | null;
      brandColor: string | null;
    };
  }
}

/**
 * Resolves brand assets for the given slug.
 *
 * - Returns `isLoading: true` while the Firestore query is in-flight.
 * - Caches results in localStorage for 24 hours.
 * - Returns null fields when no slug is provided or no vendor is found.
 *
 * @example
 * const { brandName, brandLogoUrl, brandColor, isLoading } = useBrand(slug);
 */
export function useBrand(slug: string | undefined | null): BrandAssets {
  console.log("[useBrand] Hook called with slug:", slug, "db is:", !!db);

  const [state, setState] = useState<BrandAssets>(() => {
    // 1. First-class: read from server-injected global variable (bypasses security rules/CORS)
    if (typeof window !== "undefined" && window.__LAUNDRY_BRAND__ && slug && window.__LAUNDRY_BRAND__.slug === slug) {
      const b = window.__LAUNDRY_BRAND__;
      console.log("[useBrand] Using server-injected brand:", b);
      return {
        brandName:    b.brandName,
        brandLogoUrl: b.brandLogoUrl,
        brandColor:   b.brandColor,
        isLoading:    false,
      };
    }

    // 2. Warm start from cache (synchronous, no flash)
    if (slug) {
      const cached = readCache(slug);
      if (cached) {
        console.log("[useBrand] Found cached assets for slug:", slug, cached);
        return {
          brandName:    cached.brandName,
          brandLogoUrl: cached.brandLogoUrl,
          brandColor:   cached.brandColor,
          isLoading:    false,
        };
      }
    }
    return { brandName: null, brandLogoUrl: null, brandColor: null, isLoading: !!slug };
  });

  useEffect(() => {
    console.log("[useBrand] useEffect triggered for slug:", slug, "db is:", !!db);
    if (!slug) {
      setState({ brandName: null, brandLogoUrl: null, brandColor: null, isLoading: false });
      return;
    }

    // 1. First-class: read from server-injected global variable (skip Firestore query)
    if (typeof window !== "undefined" && window.__LAUNDRY_BRAND__ && window.__LAUNDRY_BRAND__.slug === slug) {
      const b = window.__LAUNDRY_BRAND__;
      setState({
        brandName:    b.brandName,
        brandLogoUrl: b.brandLogoUrl,
        brandColor:   b.brandColor,
        isLoading:    false,
      });
      return;
    }

    // Check cache again (in case it was populated by another tab)
    const cached = readCache(slug);
    if (cached) {
      setState({
        brandName:    cached.brandName,
        brandLogoUrl: cached.brandLogoUrl,
        brandColor:   cached.brandColor,
        isLoading:    false,
      });
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, isLoading: true }));

    fetchBrandAssets(slug).then((assets) => {
      if (cancelled) return;
      if (assets) {
        writeCache(slug, assets);
        setState({ ...assets, isLoading: false });
      } else {
        setState({ brandName: null, brandLogoUrl: null, brandColor: null, isLoading: false });
      }
    });

    return () => { cancelled = true; };
  }, [slug]);

  return state;
}
