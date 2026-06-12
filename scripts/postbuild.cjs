const fs = require('fs');
const path = require('path');

// 1. Copy the server build into the Pages _worker.js directory
try {
  fs.cpSync('dist/server', 'dist/client/_worker.js', { recursive: true });
  console.log('Copied dist/server to dist/client/_worker.js');
} catch (e) {
  console.error('Failed to copy _worker.js:', e);
}

// 2. The @cloudflare/vite-plugin generates a wrangler.json with internal/Workers-only
// fields that Cloudflare Pages rejects. Replace it with a clean, minimal config.
const cleanConfig = {
  name: "kebis-laundry-app",
  compatibility_date: "2025-09-24",
  compatibility_flags: ["nodejs_compat"]
};

// Replace or delete in all locations where the plugin may have dropped it
['dist/client/wrangler.json', 'dist/server/wrangler.json', 'dist/client/_worker.js/wrangler.json'].forEach(f => {
  try {
    fs.writeFileSync(f, JSON.stringify(cleanConfig, null, 2));
    console.log(`Replaced ${f} with clean Pages config`);
  } catch (e) {
    // File may not exist, that's fine
  }
});

// 3. Generate _routes.json so Cloudflare Pages serves static assets correctly
// and doesn't route them through the SSR worker (which returns 404 for them).
const routesConfig = {
  version: 1,
  include: ["/*"],
  exclude: [
    "/assets/*",
    "/favicon.ico",
    "/sw.js",
    "/firebase-messaging-sw.js",
    "/manifest.json",
    "/icon-192.png",
    "/icon-512.png",
  ]
};
fs.writeFileSync('dist/client/_routes.json', JSON.stringify(routesConfig, null, 2));
console.log('Created dist/client/_routes.json for static asset routing');

// 4. Generate _headers for custom static asset headers on Cloudflare Pages
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
  ""
].join("\n");
fs.writeFileSync('dist/client/_headers', headersConfig);
console.log('Created dist/client/_headers for static headers');



