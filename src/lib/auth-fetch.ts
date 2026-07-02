/**
 * auth-fetch.ts
 * ─────────────────────────────────────────────────────────────────
 * Client helper that attaches the current Firebase Auth ID token as an
 * `Authorization: Bearer <jwt>` header before hitting our internal API
 * routes. The server verifies this JWT via `verify-id-token.server.ts`,
 * which eliminates trust in body-supplied identity (IDOR hardening).
 */
import { getFirebaseAuth } from "@/lib/firebase";

/**
 * Fetch wrapper that automatically adds the caller's Firebase ID token.
 * Falls through as a plain fetch when there is no signed-in user — the
 * server route will then reject with 401.
 */
export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  try {
    const auth = getFirebaseAuth();
    const user = auth?.currentUser ?? null;
    if (user) {
      const token = await user.getIdToken();
      headers.set("Authorization", `Bearer ${token}`);
    }
  } catch (err) {
    console.warn("[authFetch] could not attach id token:", err);
  }
  return fetch(input, { ...init, headers });
}
