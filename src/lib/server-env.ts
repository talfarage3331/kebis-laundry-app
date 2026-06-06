/**
 * server-env.ts
 * ─────────────────────────────────────────────────────────────────
 * Captures and exposes the Cloudflare Worker environment bindings
 * globally for server-side code (route handlers, etc.).
 */

let globalEnv: any = null;

/**
 * Capture environment bindings from the Worker fetch handler
 */
export function setServerEnv(env: any) {
  globalEnv = env;
}

/**
 * Get the environment bindings (VAPID keys, etc.)
 */
export function getServerEnv(): Record<string, string | undefined> {
  if (globalEnv) {
    return globalEnv;
  }
  // Fallback to process.env during local development
  return (typeof process !== "undefined" ? process.env : {}) as Record<string, string | undefined>;
}
