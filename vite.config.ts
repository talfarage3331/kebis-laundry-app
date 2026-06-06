// Explicitly inject VAPID public key into the client bundle
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";

// Load environment variables from .env files
const env = loadEnv(process.env.NODE_ENV ?? "development", process.cwd());

export default defineConfig({
  // Ensure the public key is available as import.meta.env.VITE_VAPID_PUBLIC_KEY
  define: {
    "import.meta.env.VITE_VAPID_PUBLIC_KEY": JSON.stringify(env.VITE_VAPID_PUBLIC_KEY),
  },
  tanstackStart: {
    server: { entry: "server" },
  },
});

