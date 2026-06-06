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
}

// ─── Notification Templates ───────────────────────────────────────────────────
// Map every backend event → the Hebrew notification the user will see.

export type NotificationEvent =
  | "laundry-picked-up"
  | "laundry-ready"
  | "laundry-delivered"
  | "price-updated"
  | "invoice-ready";

export const NOTIFICATION_TEMPLATES: Record<NotificationEvent, PushPayload> = {
  "laundry-picked-up": {
    title: "הכביסה נלקחה 🧺",
    body: "הכביסה שלך נאספה ובדרכה לניקוי",
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
};

// Map order status strings → notification event keys
export const STATUS_TO_EVENT: Partial<Record<string, NotificationEvent>> = {
  picked_up: "laundry-picked-up",
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

// ─── AES-128-GCM Payload Encryption (RFC 8291) ────────────────────────────────

async function encryptPayload(
  plaintext: string,
  p256dhBase64: string,
  authBase64: string
): Promise<ArrayBuffer> {
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const authSecret = base64urlDecode(authBase64);
  const receiverPublicKeyBytes = base64urlDecode(p256dhBase64);

  // Generate an ephemeral sender key pair
  const senderKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  const receiverPublicKey = await crypto.subtle.importKey(
    "raw",
    receiverPublicKeyBytes as any,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // ECDH shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: receiverPublicKey },
    senderKeyPair.privateKey,
    256
  );

  // Export sender public key
  const senderPublicKeyBytes = new Uint8Array(
    await crypto.subtle.exportKey("raw", senderKeyPair.publicKey)
  );

  // Generate random salt (16 bytes)
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // HKDF to derive content encryption key and nonce
  const prk = await hkdf(
    authSecret,
    new Uint8Array(sharedSecret),
    buildInfo("auth", new Uint8Array(0), new Uint8Array(0)),
    32
  );

  const cek = await hkdf(
    salt,
    prk,
    buildInfo("aesgcm", receiverPublicKeyBytes, senderPublicKeyBytes),
    16
  );

  const nonce = await hkdf(
    salt,
    prk,
    buildInfo("nonce", receiverPublicKeyBytes, senderPublicKeyBytes),
    12
  );

  // Pad plaintext: 2-byte big-endian length + plaintext + delimiter byte
  const padLen = 0;
  const paddedLen = 2 + padLen + plaintextBytes.length + 1;
  const padded = new Uint8Array(paddedLen);
  padded[0] = (padLen >> 8) & 0xff;
  padded[1] = padLen & 0xff;
  padded.set(plaintextBytes, 2 + padLen);
  padded[2 + padLen + plaintextBytes.length] = 0x02;

  // AES-GCM encrypt
  const key = await crypto.subtle.importKey("raw", cek as any, "AES-GCM", false, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce as any, tagLength: 128 },
    key,
    padded as any
  );

  // Build the aes128gcm content-encoding header (RFC 8188)
  // salt(16) + rs(4) + idlen(1) + keyid + ciphertext
  const rs = 4096;
  const header = new Uint8Array(16 + 4 + 1 + senderPublicKeyBytes.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs, false);
  header[20] = senderPublicKeyBytes.length;
  header.set(senderPublicKeyBytes, 21);

  const result = new Uint8Array(header.length + ciphertext.byteLength);
  result.set(header, 0);
  result.set(new Uint8Array(ciphertext), header.length);
  return result.buffer;
}

function buildInfo(
  type: string,
  clientPublicKey: Uint8Array,
  serverPublicKey: Uint8Array
): Uint8Array {
  const typeBytes = new TextEncoder().encode(`Content-Encoding: ${type}\0`);
  const label = new TextEncoder().encode("P-256\0");
  const info = new Uint8Array(
    typeBytes.length +
    label.length +
    2 + clientPublicKey.length +
    2 + serverPublicKey.length
  );
  let offset = 0;
  info.set(typeBytes, offset); offset += typeBytes.length;
  info.set(label, offset);    offset += label.length;
  new DataView(info.buffer).setUint16(offset, clientPublicKey.length, false); offset += 2;
  info.set(clientPublicKey, offset); offset += clientPublicKey.length;
  new DataView(info.buffer).setUint16(offset, serverPublicKey.length, false); offset += 2;
  info.set(serverPublicKey, offset);
  return info;
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const ikmKey = await crypto.subtle.importKey("raw", ikm as any, "HKDF", false, ["deriveBits"]);
  // Extract
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    salt as any,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const prk = new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, ikm as any));
  // Expand
  const prkKey = await crypto.subtle.importKey(
    "raw",
    prk as any,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const t = new Uint8Array(
    await crypto.subtle.sign("HMAC", prkKey, new Uint8Array([...info, 0x01]) as any)
  );
  return t.slice(0, length);
}

// ─── High-level helpers for route handlers ────────────────────────────────────

/**
 * Trigger a push notification for a specific user by email.
 * The env object is injected from the Cloudflare Worker context.
 */
export async function notifyUser(
  userEmail: string,
  event: NotificationEvent,
  env: { VAPID_PRIVATE_KEY: string; VAPID_PUBLIC_KEY: string; VAPID_SUBJECT: string }
): Promise<{ sent: boolean; reason?: string }> {
  const sub = await getSubscriptionByEmail(userEmail);
  if (!sub) {
    return { sent: false, reason: "no_subscription" };
  }

  const payload = NOTIFICATION_TEMPLATES[event];
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
