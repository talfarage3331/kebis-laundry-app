/**
 * push-service.ts  —  SERVER-ONLY
 * ─────────────────────────────────────────────────────────────────
 * Handles everything related to Web Push on the Cloudflare Worker:
 *   • Storing / retrieving PushSubscription objects in Firestore
 *   • Building a signed VAPID JWT for the Authorization header
 *   • Sending push messages to the Web Push protocol endpoint
 *
 * NOTE: This file must never be imported by client-side code.
 *       It uses the Web Crypto API available in Cloudflare Workers.
 * ─────────────────────────────────────────────────────────────────
 */

import { db } from "./firebase";
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  collectionGroup,
} from "firebase/firestore";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Shape stored in Firestore — one doc per user */
export interface StoredSubscription {
  userId: string;
  userEmail: string;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  createdAt: string;
  updatedAt: string;
}

/** The push payload the service worker will receive */
export interface PushPayload {
  title: string;
  body: string;
  tag: string;
  url: string;
  icon: string;
  badge: string;
  badgeCount?: number;
}

// ─── Notification Templates ───────────────────────────────────────────────────
// Map every backend event → the Hebrew notification the user will see.

export type NotificationEvent =
  | "laundry-picked-up"
  | "laundry-in-progress"
  | "laundry-ready"
  | "laundry-delivered"
  | "price-updated"
  | "invoice-ready"
  | "chat-to-customer"
  | "chat-to-staff";

export const NOTIFICATION_TEMPLATES: Record<NotificationEvent, PushPayload> = {
  "laundry-picked-up": {
    title: "הכביסה נלקחה 🧺",
    body: "הכביסה שלך נאספה ובדרכה לניקוי",
    tag: "order-status",
    url: "/tracking",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
  },
  "laundry-in-progress": {
    title: "הכביסה בטיפול 🧼",
    body: "הכביסה שלך בתהליך ניקוי וכביסה עכשיו",
    tag: "order-status",
    url: "/tracking",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
  },
  "laundry-ready": {
    title: "הכביסה מוכנה ✨",
    body: "הכביסה שלך מוכנה ותגיע אליך בקרוב!",
    tag: "order-status",
    url: "/tracking",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
  },
  "laundry-delivered": {
    title: "הכביסה נמסרה 🎉",
    body: "הכביסה נמסרה בהצלחה. תהנה!",
    tag: "order-status",
    url: "/",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
  },
  "price-updated": {
    title: "המחיר הסופי עודכן 💳",
    body: "המחיר הסופי של ההזמנה שלך עודכן — בדוק פרטים",
    tag: "billing",
    url: "/payments",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
  },
  "invoice-ready": {
    title: "החשבונית שלך מוכנה 🧾",
    body: "החשבונית שלך מוכנה במערכת לצפייה והורדה",
    tag: "billing",
    url: "/payments",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
  },
  "chat-to-customer": {
    title: "הודעה חדשה מצוות המכבסה 💬",
    body: "יש לך הודעה חדשה לגבי ההזמנה שלך",
    tag: "chat",
    url: "/chat",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
  },
  "chat-to-staff": {
    title: "הודעה חדשה מלקוח 💬",
    body: "התקבלה הודעה חדשה בשיחה עם לקוח",
    tag: "chat",
    url: "/admin-chat",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
  },
};

// Map order status strings → notification event keys
export const STATUS_TO_EVENT: Partial<Record<string, NotificationEvent>> = {
  picked_up: "laundry-picked-up",
  in_progress: "laundry-in-progress",
  ready: "laundry-ready",
  completed: "laundry-delivered",
};

// ─── Firestore Helpers ────────────────────────────────────────────────────────

const SUBSCRIPTIONS_COLLECTION = "pushSubscriptions";

/** Save or overwrite a push subscription for a user */
export async function saveSubscription(
  userEmail: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
): Promise<void> {
  // Use email as a safe document ID (replace @ and . for Firestore compatibility)
  const docId = userEmail.replace(/[@.]/g, "_");
  await setDoc(doc(db, SUBSCRIPTIONS_COLLECTION, docId), {
    userId: docId,
    userEmail,
    endpoint: subscription.endpoint,
    keys: subscription.keys,
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(), // setDoc with merge would preserve original, but we use overwrite for simplicity
  });
}

/** Remove a push subscription by endpoint */
export async function removeSubscription(endpoint: string): Promise<void> {
  const q = query(
    collection(db, SUBSCRIPTIONS_COLLECTION),
    where("endpoint", "==", endpoint)
  );
  const snap = await getDocs(q);
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
}

/** Get a subscription by user email */
export async function getSubscriptionByEmail(
  userEmail: string
): Promise<StoredSubscription | null> {
  const docId = userEmail.replace(/[@.]/g, "_");
  const snap = await getDoc(doc(db, SUBSCRIPTIONS_COLLECTION, docId));
  return snap.exists() ? (snap.data() as StoredSubscription) : null;
}

// ─── VAPID JWT Builder (Web Crypto — Cloudflare Workers native) ───────────────

function base64urlEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  let str = "";
  bytes.forEach((b) => (str += String.fromCharCode(b)));
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64urlDecode(str: string): Uint8Array {
  const padded = str + "===".slice((str.length + 3) % 4);
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function buildVapidJwt(
  endpoint: string,
  privateKeyBase64url: string,
  publicKeyBase64url: string,
  subject: string
): Promise<{ authorization: string; vapidPublicKey: string }> {
  const audience = new URL(endpoint).origin;
  const expiration = Math.floor(Date.now() / 1000) + 12 * 60 * 60; // 12 hours

  const header = { typ: "JWT", alg: "ES256" };
  const payload = { aud: audience, exp: expiration, sub: subject };

  const headerB64 = base64urlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  // Import the raw EC private key
  const privateKeyBytes = base64urlDecode(privateKeyBase64url);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    toPkcs8(privateKeyBytes),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const jwt = `${signingInput}.${base64urlEncode(signature)}`;

  return {
    authorization: `vapid t=${jwt},k=${publicKeyBase64url}`,
    vapidPublicKey: publicKeyBase64url,
  };
}

/**
 * Convert a raw 32-byte EC private key to PKCS#8 DER format
 * so that crypto.subtle.importKey("pkcs8") can accept it.
 */
function toPkcs8(rawPrivateKey: Uint8Array): ArrayBuffer {
  // PKCS#8 wrapper for P-256 private key — static prefix bytes
  const prefix = new Uint8Array([
    0x30, 0x81, 0x87, // SEQUENCE
    0x02, 0x01, 0x00, // version = 0
    0x30, 0x13,       // SEQUENCE (AlgorithmIdentifier)
    0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, // id-ecPublicKey OID
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, // P-256 OID
    0x04, 0x6d,       // OCTET STRING (inner ECPrivateKey)
    0x30, 0x6b,       // SEQUENCE
    0x02, 0x01, 0x01, // version = 1
    0x04, 0x20,       // OCTET STRING (32-byte private key follows)
  ]);
  const result = new Uint8Array(prefix.length + rawPrivateKey.length);
  result.set(prefix);
  result.set(rawPrivateKey, prefix.length);
  return result.buffer;
}

// ─── Core Send Function ───────────────────────────────────────────────────────

/**
 * Send a push notification to a single subscription endpoint.
 * Called from API route handlers — runs on the Cloudflare Worker.
 */
export async function sendPushNotification(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: PushPayload,
  env: { VAPID_PRIVATE_KEY: string; VAPID_PUBLIC_KEY: string; VAPID_SUBJECT: string }
): Promise<void> {
  const { authorization } = await buildVapidJwt(
    subscription.endpoint,
    env.VAPID_PRIVATE_KEY,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_SUBJECT
  );

  // Encrypt the payload using the Web Push encryption spec (RFC 8291 / aes128gcm)
  const encryptedBody = await encryptPayload(
    JSON.stringify(payload),
    subscription.keys.p256dh,
    subscription.keys.auth
  );

  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: "86400",
    },
    body: encryptedBody,
  });

  if (!response.ok && response.status !== 201) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Push endpoint returned ${response.status}: ${text}`
    );
  }
}

// ─── AES-128-GCM Payload Encryption (RFC 8291 / RFC 8188) ────────────────────
//
// Implements the Web Push message encryption standard exactly as specified in:
//   RFC 8291 §3  — Message Encryption for Web Push
//   RFC 8188 §2  — Encrypted Content-Encoding (aes128gcm)
//
// Key derivation summary (RFC 8291 §3.4):
//   ecdhSecret = ECDH(as_private, ua_public)           -- 32 bytes
//   ikm        = HKDF(salt=authSecret, ikm=ecdhSecret,
//                     info="WebPush: info\0"||ua_pub||as_pub, L=32)
//   cek        = HKDF(salt=salt, ikm=ikm,
//                     info="Content-Encoding: aes128gcm\0", L=16)
//   nonce      = HKDF(salt=salt, ikm=ikm,
//                     info="Content-Encoding: nonce\0",    L=12)
//
// Padding (RFC 8291 §3.2): plaintext || 0x02  (single delimiter byte only)
//
// Content-encoding header (RFC 8188 §2.1):
//   salt(16) | rs(4 BE) | idlen(1) | as_public_key(65) | ciphertext

async function encryptPayload(
  plaintext: string,
  p256dhBase64: string,
  authBase64: string
): Promise<ArrayBuffer> {
  const plaintextBytes = new TextEncoder().encode(plaintext);
  // ua = user-agent (receiver) keys from the PushSubscription
  const authSecret      = base64urlDecode(authBase64);
  const uaPublicKeyBytes = base64urlDecode(p256dhBase64);

  // ── 1. Ephemeral application-server (sender) key pair ────────────────────
  const asKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  const uaPublicKey = await crypto.subtle.importKey(
    "raw",
    uaPublicKeyBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // ── 2. ECDH shared secret (32 bytes) ─────────────────────────────────────
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "ECDH", public: uaPublicKey },
    asKeyPair.privateKey,
    256
  ));

  // Application-server public key (uncompressed, 65 bytes) — sent in header
  const asPublicKeyBytes = new Uint8Array(
    await crypto.subtle.exportKey("raw", asKeyPair.publicKey)
  );

  // ── 3. Random 16-byte salt (sent in content-encoding header) ─────────────
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // ── 4. IKM — RFC 8291 §3.3 ───────────────────────────────────────────────
  // ikm_info = "WebPush: info\0" || ua_public (65 B) || as_public (65 B)
  // ikm      = HKDF-Extract(salt=authSecret, IKM=ecdhSecret)
  //           then HKDF-Expand(PRK, ikm_info, L=32)
  const webPushInfoPrefix = new TextEncoder().encode("WebPush: info\0");
  const ikmInfo = new Uint8Array(
    webPushInfoPrefix.length + uaPublicKeyBytes.length + asPublicKeyBytes.length
  );
  ikmInfo.set(webPushInfoPrefix, 0);
  ikmInfo.set(uaPublicKeyBytes, webPushInfoPrefix.length);
  ikmInfo.set(asPublicKeyBytes, webPushInfoPrefix.length + uaPublicKeyBytes.length);

  const ikmPrk = await hkdfExtract(authSecret, ecdhSecret);
  const ikm    = await hkdfExpand(ikmPrk, ikmInfo, 32);

  // ── 5. CEK and Nonce — RFC 8291 §3.3 ─────────────────────────────────────
  // Both derived from the same salt + ikm; info strings contain NO key material.
  const contentPrk = await hkdfExtract(salt, ikm);
  const cek   = await hkdfExpand(
    contentPrk,
    new TextEncoder().encode("Content-Encoding: aes128gcm\0"),
    16
  );
  const nonce = await hkdfExpand(
    contentPrk,
    new TextEncoder().encode("Content-Encoding: nonce\0"),
    12
  );

  // ── 6. Padding — RFC 8291 §3.2 ───────────────────────────────────────────
  // Append a single 0x02 delimiter byte (no 2-byte pad-length prefix).
  const padded = new Uint8Array(plaintextBytes.length + 1);
  padded.set(plaintextBytes, 0);
  padded[plaintextBytes.length] = 0x02;

  // ── 7. AES-128-GCM encrypt ────────────────────────────────────────────────
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 },
    aesKey,
    padded
  ));

  // ── 8. RFC 8188 §2.1 content-encoding header ─────────────────────────────
  // | salt (16) | rs (4, big-endian) | idlen (1) | keyid (65) | ciphertext |
  const rs     = 4096;
  const header = new Uint8Array(16 + 4 + 1 + asPublicKeyBytes.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs, false); // big-endian
  header[20] = asPublicKeyBytes.length;                 // idlen = 65
  header.set(asPublicKeyBytes, 21);

  const result = new Uint8Array(header.length + ciphertext.byteLength);
  result.set(header, 0);
  result.set(ciphertext, header.length);
  return result.buffer;
}

// ─── HKDF Primitives (RFC 5869) ───────────────────────────────────────────────

/**
 * HKDF-Extract: PRK = HMAC-SHA-256(salt, IKM)
 * Returns a 32-byte pseudo-random key.
 */
async function hkdfExtract(salt: Uint8Array, ikm: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    salt,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, ikm));
}

/**
 * HKDF-Expand: T(1) = HMAC-SHA-256(PRK, info || 0x01)
 * Returns the first `length` bytes of T(1).
 * (Single-block expand — sufficient for L ≤ 32.)
 */
async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    prk,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const t = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new Uint8Array([...info, 0x01]))
  );
  return t.slice(0, length);
}

// ─── High-level helpers for route handlers ────────────────────────────────────

/**
 * Trigger a push notification for a specific user by email (or a group like "laundry-staff").
 * The env object is injected from the Cloudflare Worker context.
 */
export async function notifyUser(
  userEmail: string,
  event: NotificationEvent,
  env: { VAPID_PRIVATE_KEY: string; VAPID_PUBLIC_KEY: string; VAPID_SUBJECT: string },
  options?: { customBody?: string; customTitle?: string }
): Promise<{ sent: boolean; reason?: string }> {
  if (userEmail === "laundry-staff") {
    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("role", "in", ["admin", "laundry"]));
      const staffSnap = await getDocs(q);
      const staffEmails = staffSnap.docs.map(doc => doc.data().email).filter(Boolean);

      const results = await Promise.all(
        staffEmails.map(email =>
          notifyUserSingle(email, event, env, options).catch(err => {
            console.error(`[push-service] Failed to notify staff member ${email}:`, err);
            return { sent: false, reason: String(err) };
          })
        )
      );
      const sent = results.some(r => r.sent);
      return { sent, reason: `sent_to_${results.filter(r => r.sent).length}_staff_members` };
    } catch (err) {
      console.error("[push-service] Failed to notify laundry staff group:", err);
      return { sent: false, reason: "staff_lookup_failed" };
    }
  }

  return notifyUserSingle(userEmail, event, env, options);
}

/**
 * Send push to a single email with custom badge count calculation.
 */
async function notifyUserSingle(
  userEmail: string,
  event: NotificationEvent,
  env: { VAPID_PRIVATE_KEY: string; VAPID_PUBLIC_KEY: string; VAPID_SUBJECT: string },
  options?: { customBody?: string; customTitle?: string }
): Promise<{ sent: boolean; reason?: string }> {
  const sub = await getSubscriptionByEmail(userEmail);
  if (!sub) {
    return { sent: false, reason: "no_subscription" };
  }

  // Count metrics dynamically to set the iOS app badge
  let activeCount = 0;
  let unreadMessages = 0;
  try {
    // Determine if the target user is staff
    let isStaff = false;
    const userSnap = await getDocs(query(collection(db, "users"), where("email", "==", userEmail)));
    if (!userSnap.empty) {
      const role = userSnap.docs[0].data().role;
      isStaff = role === "laundry" || role === "admin";
    }

    if (isStaff) {
      // Staff / Admin:
      // 1. Total active orders in the entire system
      const snapOrders = await getDocs(collection(db, "orders"));
      activeCount = snapOrders.docs.filter((d) => {
        const data = d.data();
        return data.status && data.status !== "completed" && data.delivery_method !== "placeholder" && !d.id.startsWith("placeholder");
      }).length;

      // 2. Total unread messages across all chats (sent by customers, i.e., sender_email !== userEmail)
      const messagesGroup = collectionGroup(db, "messages");
      const snapMessages = await getDocs(query(messagesGroup, where("is_read", "==", false)));
      unreadMessages = snapMessages.docs.filter((d) => d.data().sender_email !== userEmail).length;
    } else {
      // Customer:
      // 1. Active orders for this customer
      const qOrders = query(collection(db, "orders"), where("user_email", "==", userEmail));
      const snapOrders = await getDocs(qOrders);
      activeCount = snapOrders.docs.filter((d) => {
        const data = d.data();
        return data.status && data.status !== "completed" && data.delivery_method !== "placeholder" && !d.id.startsWith("placeholder");
      }).length;

      // 2. Unread messages for this customer (sent by staff, i.e., sender_email !== userEmail)
      const messagesRef = collection(db, "chats", userEmail, "messages");
      const snapMessages = await getDocs(query(messagesRef, where("is_read", "==", false)));
      unreadMessages = snapMessages.docs.filter((d) => d.data().sender_email !== userEmail).length;
    }
  } catch (err) {
    console.error("[push-service] Failed to query user metrics for badging:", err);
  }
  const badgeCount = (activeCount + unreadMessages) || 1;

  const baseTemplate = NOTIFICATION_TEMPLATES[event];
  const payload = {
    ...baseTemplate,
    title: options?.customTitle || baseTemplate.title,
    body: options?.customBody || baseTemplate.body,
    badge: badgeCount,
    badgeCount: badgeCount,
  };

  try {
    await sendPushNotification(sub, payload, env);
    return { sent: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // If the subscription is expired/invalid, clean it up
    if (msg.includes("410") || msg.includes("404")) {
      await removeSubscription(sub.endpoint).catch(() => {});
      return { sent: false, reason: "subscription_expired" };
    }
    throw err;
  }
}
