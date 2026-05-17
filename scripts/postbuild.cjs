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
