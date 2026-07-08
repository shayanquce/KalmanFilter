import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// These endpoints do not send CORS headers, so the dev server proxies them and
// the browser only ever talks to localhost. Two Yahoo hosts give failover if
// one is flaky or blocked. Alpha Vantage is a different domain entirely, which
// is the escape hatch on networks that firewall Yahoo Finance.
const yahooHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
  Accept: "application/json",
};

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api/yahoo1": {
        target: "https://query1.finance.yahoo.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/yahoo1/, ""),
        headers: yahooHeaders,
      },
      "/api/yahoo2": {
        target: "https://query2.finance.yahoo.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/yahoo2/, ""),
        headers: yahooHeaders,
      },
      "/api/av": {
        target: "https://www.alphavantage.co",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/av/, ""),
      },
    },
  },
});
