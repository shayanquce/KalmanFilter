// Vercel serverless function. The browser cannot call Yahoo Finance directly
// (no CORS headers), so this endpoint does it server-side and returns the raw
// chart JSON. Tries both Yahoo hosts before giving up.

const HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

export default async function handler(req, res) {
  const { symbol = "", period1 = "", period2 = "" } = req.query ?? {};
  const p1 = Number(period1);
  const p2 = Number(period2);
  if (!symbol || !Number.isFinite(p1) || !Number.isFinite(p2) || p1 >= p2) {
    res.status(400).json({ error: "expected symbol, period1, period2 (unix seconds)" });
    return;
  }

  const problems = [];
  for (const host of HOSTS) {
    try {
      const url =
        `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}` +
        `?period1=${p1}&period2=${p2}&interval=1d&events=div%2Csplit`;
      const upstream = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
      });
      const body = await upstream.text();
      if (upstream.ok) {
        res.setHeader("Content-Type", "application/json");
        // Daily bars only change once a day; let Vercel's CDN absorb repeats.
        res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
        res.status(200).send(body);
        return;
      }
      problems.push(`${host}: HTTP ${upstream.status}`);
    } catch (e) {
      problems.push(`${host}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  res.status(502).json({ error: problems.join("; ") });
}
