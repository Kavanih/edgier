import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The AI sidecar holds the OpenRouter key; the browser only ever sees /api.
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
});
