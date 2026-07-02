/**
 * verify-id-token.server.ts — SERVER-ONLY
 *
 * Verifies a Firebase Auth ID token (RS256 JWT) using Google's public JWKs.
 * Fully Workers-compatible: uses WebCrypto + fetch, no Node built-ins,
 * no external npm dependencies.
 *
 * Usage:
 *   const claims = await verifyIdToken(request);
 *   // claims.uid, claims.email, claims.email_verified, claims.role (if custom claim)
 *
 * Throws Response(401) when the token is missing or invalid. Callers should
 * let the throw propagate — the route wrapper below turns it into a 401.
 */
import { getFirebaseProjectId } from "./fcm-admin.server";

// ─── JWK cache ────────────────────────────────────────────────────────────
type Jwk = {
  kty: string;
  kid: string;
  n: string;
  e: string;
  alg?: string;
  use?: string;
};

let jwksCache: { keys: Record<string, CryptoKey>; exp: number } | null = null;

const JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

async function getJwks(): Promise<Record<string, CryptoKey>> {
  if (jwksCache && jwksCache.exp > Date.now()) return jwksCache.keys;

  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`Failed to fetch JWKs: ${res.status}`);
  const cacheControl = res.headers.get("cache-control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const ttlMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : 60 * 60 * 1000;

  const json = (await res.json()) as { keys: Jwk[] };
  const keys: Record<string, CryptoKey> = {};
  for (const jwk of json.keys) {
    if (jwk.kty !== "RSA") continue;
    try {
      const key = await crypto.subtle.importKey(
        "jwk",
        jwk as unknown as JsonWebKey,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
      keys[jwk.kid] = key;
    } catch (err) {
      console.warn("[verify-id-token] failed to import jwk", jwk.kid, err);
    }
  }
  jwksCache = { keys, exp: Date.now() + ttlMs };
  return keys;
}

// ─── Base64url ────────────────────────────────────────────────────────────
function b64urlToBytes(input: string): ArrayBuffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
}
function b64urlToString(input: string): string {
  return new TextDecoder().decode(new Uint8Array(b64urlToBytes(input)));
}

// ─── Verified claims ──────────────────────────────────────────────────────
export interface VerifiedClaims {
  uid: string;
  email?: string;
  email_verified?: boolean;
  role?: string;
  aud: string;
  iss: string;
  exp: number;
  iat: number;
  auth_time?: number;
  raw: Record<string, unknown>;
}

/** Reject helper — throws a Response the route framework returns verbatim. */
function unauthorized(msg: string): never {
  throw new Response(JSON.stringify({ error: "unauthorized", message: msg }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Verify a Firebase Auth ID token from the `Authorization: Bearer <jwt>`
 * header on the incoming Request. Throws a 401 Response if missing/invalid.
 */
export async function verifyIdToken(request: Request): Promise<VerifiedClaims> {
  const header = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    unauthorized("missing bearer token");
  }
  const token = header.slice(7).trim();
  const parts = token.split(".");
  if (parts.length !== 3) unauthorized("malformed token");

  let head: { alg?: string; kid?: string; typ?: string };
  let payload: Record<string, unknown>;
  try {
    head = JSON.parse(b64urlToString(parts[0]));
    payload = JSON.parse(b64urlToString(parts[1]));
  } catch {
    unauthorized("invalid token encoding");
  }

  if (head.alg !== "RS256") unauthorized("unexpected alg");
  if (!head.kid) unauthorized("missing kid");

  const projectId = getFirebaseProjectId();
  const now = Math.floor(Date.now() / 1000);

  if (payload.aud !== projectId) unauthorized("bad audience");
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) unauthorized("bad issuer");
  if (typeof payload.sub !== "string" || !payload.sub) unauthorized("bad subject");
  if (typeof payload.exp !== "number" || payload.exp <= now) unauthorized("token expired");
  if (typeof payload.iat !== "number" || payload.iat > now + 60) unauthorized("bad iat");
  if (payload.auth_time !== undefined && (payload.auth_time as number) > now + 60) {
    unauthorized("bad auth_time");
  }

  const jwks = await getJwks();
  const key = jwks[head.kid];
  if (!key) {
    // Force refresh once — key rotation edge case
    jwksCache = null;
    const refreshed = await getJwks();
    const k2 = refreshed[head.kid];
    if (!k2) unauthorized("unknown key id");
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      k2,
      b64urlToBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!ok) unauthorized("bad signature");
  } else {
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      b64urlToBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!ok) unauthorized("bad signature");
  }

  return {
    uid: payload.sub as string,
    email: typeof payload.email === "string" ? (payload.email as string) : undefined,
    email_verified: payload.email_verified === true,
    role: typeof payload.role === "string" ? (payload.role as string) : undefined,
    aud: payload.aud as string,
    iss: payload.iss as string,
    exp: payload.exp as number,
    iat: payload.iat as number,
    auth_time: payload.auth_time as number | undefined,
    raw: payload,
  };
}

/**
 * Look up the caller's role from the Firestore user doc when it isn't
 * present as a custom claim. Uses the admin Firestore REST client.
 */
export async function getCallerRole(uid: string): Promise<"admin" | "laundry" | "customer"> {
  const { findUserById } = await import("./firestore-admin.server");
  const doc = await findUserById(uid);
  const role = doc?.fields?.role?.stringValue;
  if (role === "admin" || role === "laundry" || role === "customer") return role;
  return "customer";
}
