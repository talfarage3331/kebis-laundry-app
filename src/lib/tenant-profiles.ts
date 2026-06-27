/**
 * tenant-profiles.ts
 *
 * Multi-tenant customer profile helpers.
 *
 * Each customer can belong to many laundry vendors. Membership is recorded in
 * per-vendor sub-collections rather than a single field on the global user doc.
 */

import { getApps, getApp } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collectionGroup,
  query,
  where,
  getDocs,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";

// ── Types ──────────────────────────────────────────────────────────────────

export interface CustomerProfile {
  uid: string;
  email: string;
  fullName: string;
  /** Slug of the laundry vendor this profile belongs to. */
  activeTenantSlug: string;
  /** Firestore server timestamp — set on creation, not updated on every call. */
  joinedAt?: unknown;
  savedOrder?: Record<string, any>;
}

// ── Internal helpers ───────────────────────────────────────────────────────

function getLiveDb(): Firestore {
  const apps = getApps();
  if (!apps.length) throw new Error("[tenant-profiles] Firebase app not initialised");
  return getFirestore(apps[0]);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Idempotent upsert: creates or updates a customer profile under the given
 * laundry vendor sub-collection. Safe to call on every shop slug visit.
 *
 * Uses merge true so repeated calls never overwrite joinedAt.
 *
 * @param uid       - Firebase Auth UID of the customer
 * @param laundryId - Firestore document ID of the laundry vendor
 * @param data      - Profile fields to set or update
 */
export async function ensureCustomerProfile(
  uid: string,
  laundryId: string,
  data: Omit<CustomerProfile, "joinedAt">,
): Promise<void> {
  if (!uid || !laundryId) {
    console.warn("[tenant-profiles] ensureCustomerProfile called with empty uid or laundryId");
    return;
  }

  try {
    const db = getLiveDb();
    const profileRef = doc(db, "laundries", laundryId, "customers", uid);
    const existing = await getDoc(profileRef);

    if (existing.exists()) {
      // Only update mutable fields — preserve joinedAt
      await setDoc(
        profileRef,
        {
          uid: data.uid,
          email: data.email,
          fullName: data.fullName,
          activeTenantSlug: data.activeTenantSlug,
        },
        { merge: true },
      );
    } else {
      // First time — stamp joinedAt
      await setDoc(profileRef, {
        ...data,
        joinedAt: serverTimestamp(),
      });
      console.log(`[tenant-profiles] Created customer profile: laundries/${laundryId}/customers/${uid}`);
    }
  } catch (err) {
    // Non-fatal: log and continue — the auth flow should not be blocked by this
    console.error("[tenant-profiles] ensureCustomerProfile failed:", err);
  }
}

/**
 * Reads a single customer profile for a specific vendor.
 * Returns `null` if the profile does not exist.
 */
export async function getCustomerProfile(
  uid: string,
  laundryId: string,
): Promise<CustomerProfile | null> {
  if (!uid || !laundryId) return null;
  try {
    const db = getLiveDb();
    const snap = await getDoc(doc(db, "laundries", laundryId, "customers", uid));
    if (!snap.exists()) return null;
    return snap.data() as CustomerProfile;
  } catch (err) {
    console.error("[tenant-profiles] getCustomerProfile failed:", err);
    return null;
  }
}

/**
 * Returns all laundry IDs the customer belongs to by querying the
 * `customers` collectionGroup across all laundries.
 *
 * Requires a Firestore collectionGroup index on the `uid` field
 * (add to firestore.indexes.json if not present).
 *
 * Returns an empty array on error.
 */
export async function getCustomerLaundryIds(uid: string): Promise<string[]> {
  if (!uid) return [];
  try {
    const db = getLiveDb();
    const snap = await getDocs(
      query(collectionGroup(db, "customers"), where("uid", "==", uid)),
    );
    // The parent path of each doc is laundries/{laundryId}/customers/{uid}
    return snap.docs.map((d) => d.ref.parent.parent?.id).filter(Boolean) as string[];
  } catch (err) {
    console.error("[tenant-profiles] getCustomerLaundryIds failed:", err);
    return [];
  }
}

/**
 * Returns all customer profiles across all laundries for this vendor.
 * Used by the vendor's admin-chat and dashboard to enumerate their customers.
 *
 * @param laundryId - Firestore document ID of the laundry vendor
 */
export async function getVendorCustomers(laundryId: string): Promise<CustomerProfile[]> {
  if (!laundryId) return [];
  try {
    const db = getLiveDb();
    const { collection, getDocs: gd } = await import("firebase/firestore");
    const snap = await gd(collection(db, "laundries", laundryId, "customers"));
    return snap.docs.map((d) => d.data() as CustomerProfile);
  } catch (err) {
    console.error("[tenant-profiles] getVendorCustomers failed:", err);
    return [];
  }
}
