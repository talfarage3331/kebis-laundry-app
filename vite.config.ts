import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  // Force Nitro to run outside the Lovable sandbox (Cloudflare Pages builds do
  // not set Lovable context). Without this, vite build only emits the static
  // client bundle and postbuild has no complete Worker/SSR bundle to copy.
  nitro: {
    preset: "cloudflare-module",
    output: {
      dir: "dist",
      serverDir: "dist/server",
      publicDir: "dist/client",
    },
    cloudflare: {
      nodeCompat: true,
      deployConfig: true,
    },
  },
});
