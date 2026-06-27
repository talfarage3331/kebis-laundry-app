/**
 * server-env.ts
 * ─────────────────────────────────────────────────────────────────
 * Captures and exposes the Cloudflare Worker environment bindings
 * globally for server-side code (route handlers, etc.).
 *
 * SECURITY: All Firebase Admin credentials are read EXCLUSIVELY from
 * the FIREBASE_SERVICE_ACCOUNT environment variable, which must be set
 * as a Cloudflare Worker secret via:
 *
 *   wrangler secret put FIREBASE_SERVICE_ACCOUNT
 *
 * NO credentials are ever hardcoded here. If the secret is missing,
 * the server will throw at runtime — this is intentional and safe.
 */

let globalEnv: any = null;

/**
 * Capture environment bindings from the Worker fetch handler.
 * Call this once during Worker startup before handling any requests.
 */
export function setServerEnv(env: any) {
  globalEnv = env;
}

/**
 * Get the environment bindings (VAPID keys, Firebase service account, etc.)
 * Returns a merged view of the Worker env and process.env for local dev.
 */
export function getServerEnv(): Record<string, string | undefined> {
  const env = globalEnv || (typeof process !== "undefined" ? process.env : {});
  return { ...env };
}
