const fs = require("fs");
const path = require("path");

// ── 1. Copy server build → _worker.js directory ──────────────────────────────
try {
  fs.cpSync("dist/server", "dist/client/_worker.js", { recursive: true });
  console.log("✔  Copied dist/server → dist/client/_worker.js");
} catch (e) {
  console.error("✘  Failed to copy _worker.js:", e);
  process.exit(1);
}

// ── 2. Rename entry to index.js ───────────────────────────────────────────────
// Cloudflare Pages expects the worker entry point to be named index.js.
const workerDir = "dist/client/_worker.js";
const workerIndexPath = path.join(workerDir, "index.js");
for (const candidate of ["server.js", "index.mjs", "server.mjs"]) {
  const p = path.join(workerDir, candidate);
  try {
    if (fs.existsSync(p) && !fs.existsSync(workerIndexPath)) {
      fs.renameSync(p, workerIndexPath);
      console.log(`✔  Renamed ${candidate} → index.js in _worker.js`);
      break;
    }
  } catch (e) {
    console.error(`✘  Failed to rename ${candidate}:`, e);
  }
}

// ── 3. Validate that the critical worker files are present ───────────────────
// Nitro 3's Cloudflare output no longer uses the older assets/worker-entry-*.js
// layout. The deployable Pages Worker is index.js plus the runtime chunks in
// _ssr/, _libs/, and _chunks/. Validate the actual current bundle shape instead
// of failing on a stale chunk-name expectation.
const requiredWorkerFiles = [
  workerIndexPath,
  path.join(workerDir, "_ssr", "index.mjs"),
  path.join(workerDir, "_chunks", "ssr-renderer.mjs"),
];
let missingCritical = false;
for (const file of requiredWorkerFiles) {
  if (!fs.existsSync(file)) {
    console.error(
      `✘  CRITICAL: Missing ${file}. ` +
        "The worker bundle is incomplete — deploy will fail with a 500."
    );
    missingCritical = true;
  }
}
if (missingCritical) {
  process.exit(1);
}
try {
  const workerFileCount = fs.readdirSync(workerDir, { recursive: true }).filter((entry) => {
    const fullPath = path.join(workerDir, entry.toString());
    return fs.statSync(fullPath).isFile();
  }).length;
  console.log(`✔  Worker bundle validated (${workerFileCount} files in _worker.js/)`);
} catch (_) {}

// ── 4. Replace generated wrangler.json with a clean Pages-compatible config ──
// The @cloudflare/vite-plugin generates a wrangler.json with Workers-only
// fields that Cloudflare Pages rejects. Replace it everywhere.
const cleanConfig = {
  name: "kebis-laundry-app",
  compatibility_date: "2025-09-24",
  compatibility_flags: ["nodejs_compat"],
};
[
  "dist/client/wrangler.json",
  "dist/server/wrangler.json",
  "dist/client/_worker.js/wrangler.json",
].forEach((f) => {
  try {
    fs.writeFileSync(f, JSON.stringify(cleanConfig, null, 2));
    console.log(`✔  Replaced ${f} with clean Pages config`);
  } catch (_) {
    // File may not exist, that's fine
  }
});

// ── 5. Generate _routes.json ──────────────────────────────────────────────────
// Static assets are excluded so they bypass the SSR worker entirely.
// _worker.js/* is also excluded so Cloudflare doesn't try to serve worker
// internals as static files (which would cause a 500 on mis-matched paths).
const routesConfig = {
  version: 1,
  include: ["/*"],
  exclude: [
    "/assets/*",
    "/_worker.js/*",
    "/favicon.ico",
    "/sw.js",
    "/firebase-messaging-sw.js",
    "/manifest.json",
    "/icon-192.png",
    "/icon-512.png",
  ],
};
fs.writeFileSync("dist/client/_routes.json", JSON.stringify(routesConfig, null, 2));
console.log("✔  Created dist/client/_routes.json");

// ── 6. Generate _headers ──────────────────────────────────────────────────────
const headersConfig = [
  "/sw.js",
  "  Content-Type: application/javascript",
  "  Cache-Control: no-store, no-cache, must-revalidate, max-age=0",
  "  Service-Worker-Allowed: /",
  "",
  "/firebase-messaging-sw.js",
  "  Content-Type: application/javascript",
  "  Cache-Control: no-store, no-cache, must-revalidate, max-age=0",
  "  Service-Worker-Allowed: /",
  "",
].join("\n");
fs.writeFileSync("dist/client/_headers", headersConfig);
console.log("✔  Created dist/client/_headers");
