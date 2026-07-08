import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";
const yahooHeaders = { "User-Agent": UA, Accept: "application/json" };

// Dev twin of api/chart.js (the Vercel serverless function), so the client
// hits the same /api/chart route locally and in production.
function chartApiDev(): Plugin {
  return {
    name: "chart-api-dev",
    configureServer(server) {
      server.middlewares.use("/api/chart", (req, res) => {
        void (async () => {
          const u = new URL(req.url ?? "", "http://localhost");
          const symbol = u.searchParams.get("symbol") ?? "";
          const p1 = Number(u.searchParams.get("period1"));
          const p2 = Number(u.searchParams.get("period2"));

          res.setHeader("Content-Type", "application/json");
          if (!symbol || !Number.isFinite(p1) || !Number.isFinite(p2) || p1 >= p2) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "expected symbol, period1, period2 (unix seconds)" }));
            return;
          }

          const problems: string[] = [];
          for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
            try {
              const url =
                `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}` +
                `?period1=${p1}&period2=${p2}&interval=1d&events=div%2Csplit`;
              const upstream = await fetch(url, { headers: yahooHeaders });
              const body = await upstream.text();
              if (upstream.ok) {
                res.statusCode = 200;
                res.end(body);
                return;
              }
              problems.push(`${host}: HTTP ${upstream.status}`);
            } catch (e) {
              problems.push(`${host}: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
          res.statusCode = 502;
          res.end(JSON.stringify({ error: problems.join("; ") }));
        })();
      });
    },
  };
}

const yahoo1 = {
  target: "https://query1.finance.yahoo.com",
  changeOrigin: true,
  headers: yahooHeaders,
};

export default defineConfig({
  plugins: [react(), chartApiDev()],
  server: {
    // Fail loudly if 5173 is taken instead of silently hopping ports, which
    // leaves browser tabs pointed at stale servers.
    strictPort: true,
    proxy: {
      // Direct passthrough routes, kept as fallback behind /api/chart. The
      // same routes exist in production via vercel.json rewrites.
      "/api/yahoo1": { ...yahoo1, rewrite: (p) => p.replace(/^\/api\/yahoo1/, "") },
      "/api/yahoo2": {
        target: "https://query2.finance.yahoo.com",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/yahoo2/, ""),
        headers: yahooHeaders,
      },
      // Legacy alias so a browser tab still running an older bundle keeps working.
      "/api/market": { ...yahoo1, rewrite: (p) => p.replace(/^\/api\/market/, "") },
      "/api/av": {
        target: "https://www.alphavantage.co",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/av/, ""),
      },
    },
  },
});
