/**
 * resolve-slug.server.ts
 *
 * Server-side (Cloudflare Worker edge) utility that resolves a URL slug to the
 * vendor's brand assets using the Firestore REST API (admin credentials —
 * bypasses security rules, no Firebase Web SDK needed).
 *
 * Used by server.ts to inject OpenGraph meta tags for social crawlers.
 */

import { getGoogleAccessToken, getFirebaseProjectId } from "./fcm-admin.server";

// ── Types ──────────────────────────────────────────────────────────────────

export interface VendorBrand {
  name: string;
  logoUrl: string | null;
  brandColor: string | null;
}

// ── Firestore REST helpers ─────────────────────────────────────────────────

function fsBase(): string {
  return `https://firestore.googleapis.com/v1/projects/${getFirebaseProjectId()}/databases/(default)/documents`;
}

async function authHeader(): Promise<string> {
  const token = await getGoogleAccessToken();
  return `Bearer ${token}`;
}

/** Run a structured query against the users collection. */
async function runQuery(filter: Record<string, unknown>): Promise<Record<string, any>[]> {
  const auth = await authHeader();
  const res = await fetch(`${fsBase()}:runQuery`, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "users" }],
        where: filter,
        limit: 1,
      },
    }),
  });
  if (!res.ok) return [];
  const rows = (await res.json()) as any[];
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r?.document?.fields)
    .map((r) => r.document.fields);
}

/** Fetch a users/{uid} document directly. */
async function getDoc(uid: string): Promise<Record<string, any> | null> {
  const auth = await authHeader();
  const res = await fetch(`${fsBase()}/users/${uid}`, {
    headers: { Authorization: auth },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as any;
  return json?.fields ?? null;
}

/** Extract a string value from Firestore REST fields format. */
function str(fields: Record<string, any>, key: string): string | null {
  return fields?.[key]?.stringValue ?? null;
}

function extractBrand(fields: Record<string, any>): VendorBrand {
  return {
    name:       str(fields, "businessName") || str(fields, "fullName") || str(fields, "name") || "מכבסה",
    logoUrl:    str(fields, "logoUrl"),
    brandColor: str(fields, "brandColor"),
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Resolves a slug/UID to VendorBrand using three fallback strategies:
 *   1. users where shopSlug == slug
 *   2. users where slug == slug
 *   3. direct users/{slug} document (UID)
 *
 * Returns null if no matching vendor is found.
 */
export async function resolveSlugToBrand(slug: string): Promise<VendorBrand | null> {
  try {
    // Strategy 1 — shopSlug (primary)
    const snap1 = await runQuery({
      fieldFilter: {
        field: { fieldPath: "shopSlug" },
        op: "EQUAL",
        value: { stringValue: slug },
      },
    });
    if (snap1.length > 0) return extractBrand(snap1[0]);

    // Strategy 2 — slug (legacy alias)
    const snap2 = await runQuery({
      fieldFilter: {
        field: { fieldPath: "slug" },
        op: "EQUAL",
        value: { stringValue: slug },
      },
    });
    if (snap2.length > 0) return extractBrand(snap2[0]);

    // Strategy 3 — direct UID document
    const direct = await getDoc(slug);
    if (direct) {
      const role = str(direct, "role");
      if (role === "laundry" || role === "admin") return extractBrand(direct);
    }
  } catch (err) {
    console.error("[resolve-slug.server] Firestore query failed:", err);
  }

  return null;
}
