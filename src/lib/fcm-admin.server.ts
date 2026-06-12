/**
 * Server-only Google service-account client (FCM HTTP v1 + Firestore REST).
 *
 * Reads FIREBASE_SERVICE_ACCOUNT (full service-account JSON as a string),
 * mints a Google OAuth2 access token via service-account JWT (RS256).
 * The token is scoped for BOTH FCM and Firestore so server code can
 * read/write Firestore with admin privileges (bypasses security rules)
 * and send pushes — all over plain HTTPS, Workers-compatible.
 */

import { getServerEnv } from "./server-env";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

const SCOPES =
  "https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore";

let cachedToken: { token: string; exp: number } | null = null;

function getServiceAccount(): ServiceAccount {
  const env = getServerEnv();
  const raw = env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    const errMsg = "[fcm-admin] CRITICAL: FIREBASE_SERVICE_ACCOUNT environment variable is not set on the server/worker bindings.";
    console.error(errMsg);
    throw new Error(errMsg);
  }
  let parsed: ServiceAccount;
  try {
    parsed = JSON.parse(raw);
  } catch (err: any) {
    const errMsg = `[fcm-admin] CRITICAL: FIREBASE_SERVICE_ACCOUNT secret failed to parse as JSON. Error: ${err?.message || String(err)}`;
    console.error(errMsg);
    throw new Error(errMsg);
  }
  if (!parsed.client_email || !parsed.private_key || !parsed.project_id) {
    const errMsg = "[fcm-admin] CRITICAL: FIREBASE_SERVICE_ACCOUNT JSON is missing required fields (client_email, private_key, project_id).";
    console.error(errMsg);
    throw new Error(errMsg);
  }
  return parsed;
}

export function getFirebaseProjectId(): string {
  return getServiceAccount().project_id;
}

function base64UrlEncode(input: string | ArrayBuffer): string {
  let str: string;
  if (typeof input === "string") {
    str = btoa(input);
  } else {
    const bytes = new Uint8Array(input);
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    str = btoa(s);
  }
  return str.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  // Handle keys where "\n" arrived as literal backslash-n in the secret value
  const normalized = pem.replace(/\\n/g, "\n");
  const b64 = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
}

export async function getGoogleAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;

  const sa = getServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: SCOPES,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  let cryptoKey: CryptoKey;
  try {
    const keyBuf = pemToArrayBuffer(sa.private_key);
    cryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      keyBuf,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );
  } catch (err) {
    throw new Error(
      `FIREBASE_SERVICE_ACCOUNT private_key could not be parsed (RS256 import failed): ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  const jwt = `${signingInput}.${base64UrlEncode(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }).toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google OAuth token exchange failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: json.access_token,
    exp: Date.now() + json.expires_in * 1000,
  };
  return json.access_token;
}

export interface FcmMessageInput {
  token: string;
  title: string;
  body: string;
  url?: string;
  tag?: string;
  badgeCount?: number;
}

export async function sendFcmMessage(
  input: FcmMessageInput
): Promise<{ ok: boolean; status: number; body?: any }> {
  const projectId = getFirebaseProjectId();
  const accessToken = await getGoogleAccessToken();
  const message = {
    message: {
      token: input.token,
      // Data-only payload so the SW's onBackgroundMessage controls rendering
      data: {
        title: input.title,
        body: input.body,
        url: input.url ?? "/",
        tag: input.tag ?? "kebisa-general",
        badgeCount: String(input.badgeCount ?? 1),
      },
      webpush: {
        headers: { Urgency: "high", TTL: "86400" },
        fcm_options: { link: input.url ?? "/" },
      },
    },
  };
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    }
  );
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    console.error("[fcm-admin] FCM send failed:", res.status, JSON.stringify(body));
  }
  return { ok: res.ok, status: res.status, body };
}
