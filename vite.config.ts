// Explicitly inject VAPID public key into the client bundle
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  define: {
    "import.meta.env.VITE_VAPID_PUBLIC_KEY": JSON.stringify("BE-wjIBXEOGXMLdrgLD78KcaStjqCSjuYRvSgZFcCCjvYcLe5EFr6-zMismBm7MRfYDbaH6BK44-vBIqYkLWMWg"),
  },
  tanstackStart: {
    server: { entry: "server" },
  },
});


