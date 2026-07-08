import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The Yahoo Finance chart endpoint has no CORS headers, so the dev server
// proxies it. This keeps the app keyless and single-stack.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/market": {
        target: "https://query1.finance.yahoo.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/market/, ""),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      },
    },
  },
});
