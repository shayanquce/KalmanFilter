// Market data layer. Daily adjusted closes with automatic failover so one
// flaky or firewalled host does not take the whole app down.
//
// Order of attempts:
//   1. Yahoo Finance host query1 (keyless)
//   2. Yahoo Finance host query2 (keyless)
//   3. Alpha Vantage, only if the user has saved a key (different domain, the
//      fallback for networks that block Yahoo)
//
// All three are reached through the Vite dev proxy, so the browser only talks
// to localhost and there is no CORS to fight.

export interface DailySeries {
  symbol: string;
  dates: string[]; // ISO yyyy-mm-dd, ascending
  closes: Float64Array;
  source: string;
}

const AV_KEY_STORAGE = "kt.alphaVantageKey";

export function getAlphaVantageKey(): string {
  try {
    return localStorage.getItem(AV_KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function setAlphaVantageKey(key: string): void {
  try {
    if (key.trim()) localStorage.setItem(AV_KEY_STORAGE, key.trim());
    else localStorage.removeItem(AV_KEY_STORAGE);
  } catch {
    // Private mode with storage disabled: keep going without persistence.
  }
}

interface YahooChartResponse {
  chart: {
    result: Array<{
      timestamp: number[];
      indicators: {
        quote: Array<{ close: Array<number | null> }>;
        adjclose?: Array<{ adjclose: Array<number | null> }>;
      };
    }> | null;
    error: { code: string; description: string } | null;
  };
}

function toIsoDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

async function fetchJson(url: string, timeoutMs = 12000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Guard against a server answering with an HTML error page or SPA fallback. */
async function readChartJson(res: Response): Promise<YahooChartResponse> {
  const ct = res.headers.get("content-type") ?? "";
  if (!res.ok) {
    if (ct.includes("json")) {
      const body = (await res.json()) as { error?: string };
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    throw new Error(`HTTP ${res.status}, request never reached the data source`);
  }
  if (!ct.includes("json")) throw new Error("unexpected non-JSON response");
  return (await res.json()) as YahooChartResponse;
}

function parseYahooChart(json: YahooChartResponse, symbol: string, source: string): DailySeries {
  if (json.chart.error) throw new Error(json.chart.error.description);

  const result = json.chart.result?.[0];
  if (!result || !result.timestamp?.length) throw new Error("empty response");

  const raw =
    result.indicators.adjclose?.[0]?.adjclose ?? result.indicators.quote?.[0]?.close;
  if (!raw) throw new Error("no close prices in response");

  const dates: string[] = [];
  const closes: number[] = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const c = raw[i];
    if (c != null && Number.isFinite(c)) {
      dates.push(toIsoDate(result.timestamp[i]));
      closes.push(c);
    }
  }
  if (closes.length < 30) throw new Error(`only ${closes.length} usable rows`);
  return { symbol, dates, closes: Float64Array.from(closes), source };
}

/**
 * The app's own API route. Served by api/chart.js on Vercel and by the
 * matching middleware in vite.config.ts during development, so it exists in
 * both environments. This is the primary source.
 */
async function fetchFromAppApi(
  symbol: string,
  period1: number,
  period2: number,
): Promise<DailySeries> {
  const url =
    `/api/chart?symbol=${encodeURIComponent(symbol)}` +
    `&period1=${period1}&period2=${period2}`;
  const json = await readChartJson(await fetchJson(url));
  return parseYahooChart(json, symbol, "yahoo");
}

/** Direct proxy passthrough to a Yahoo host, the secondary route. */
async function fetchFromYahoo(
  host: "yahoo1" | "yahoo2" | "market",
  symbol: string,
  period1: number,
  period2: number,
): Promise<DailySeries> {
  const url =
    `/api/${host}/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?period1=${period1}&period2=${period2}&interval=1d&events=div%2Csplit`;
  const json = await readChartJson(await fetchJson(url));
  return parseYahooChart(json, symbol, host);
}

interface AvResponse {
  "Time Series (Daily)"?: Record<string, { "4. close": string }>;
  Note?: string;
  Information?: string;
  "Error Message"?: string;
}

async function fetchFromAlphaVantage(
  symbol: string,
  startDate: string,
  endDate: string,
  key: string,
): Promise<DailySeries> {
  const url =
    `/api/av/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}` +
    `&outputsize=full&apikey=${encodeURIComponent(key)}`;
  const res = await fetchJson(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as AvResponse;

  // Alpha Vantage returns 200 with an explanatory field on rate limits or bad
  // symbols, so the real status is in the body.
  if (json["Error Message"]) throw new Error("symbol not recognized");
  if (json.Note || json.Information) {
    throw new Error("Alpha Vantage rate limit reached, try again in a minute");
  }
  const ts = json["Time Series (Daily)"];
  if (!ts) throw new Error("unexpected Alpha Vantage response");

  const dates: string[] = [];
  const closes: number[] = [];
  for (const d of Object.keys(ts).sort()) {
    if (d >= startDate && d <= endDate) {
      const c = Number(ts[d]["4. close"]);
      if (Number.isFinite(c)) {
        dates.push(d);
        closes.push(c);
      }
    }
  }
  if (closes.length < 30) throw new Error(`only ${closes.length} rows in range`);
  return { symbol, dates, closes: Float64Array.from(closes), source: "alphavantage" };
}

/** Try a fetch, retry once on failure, so a single hiccup does not fail over. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return await fn();
  }
}

export async function fetchDailySeries(
  symbol: string,
  startDate: string,
  endDate: string,
): Promise<DailySeries> {
  // Guard the inputs before they become a malformed URL. An empty or
  // half-typed date field turns into NaN, and Yahoo rejects those requests.
  if (!symbol.trim()) throw new Error("ticker is empty");
  const period1 = Math.floor(new Date(startDate + "T00:00:00Z").getTime() / 1000);
  const period2 = Math.floor(new Date(endDate + "T23:59:59Z").getTime() / 1000);
  if (!Number.isFinite(period1) || !Number.isFinite(period2)) {
    throw new Error("pick valid start and end dates before running");
  }
  if (period1 >= period2) {
    throw new Error("start date must be before end date");
  }

  const attempts: Array<{ label: string; run: () => Promise<DailySeries> }> = [
    // Primary: the app's own API, which exists in dev and on Vercel and does
    // its own Yahoo host failover server-side.
    { label: "app API", run: () => fetchFromAppApi(symbol, period1, period2) },
    // Secondary: direct proxy passthroughs.
    { label: "Yahoo (host 1)", run: () => fetchFromYahoo("yahoo1", symbol, period1, period2) },
    { label: "Yahoo (host 2)", run: () => fetchFromYahoo("yahoo2", symbol, period1, period2) },
  ];
  const key = getAlphaVantageKey();
  if (key) {
    attempts.push({
      label: "Alpha Vantage",
      run: () => fetchFromAlphaVantage(symbol, startDate, endDate, key),
    });
  }

  const problems: string[] = [];
  for (const attempt of attempts) {
    try {
      return await withRetry(attempt.run);
    } catch (e) {
      problems.push(`${attempt.label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const hint = key
    ? ""
    : " If Yahoo is blocked on this network, add an Alpha Vantage key from the Data menu.";
  throw new Error(`${symbol} could not be loaded. ${problems.join("; ")}.${hint}`);
}

export interface AlignedPair {
  dates: string[];
  a: Float64Array;
  b: Float64Array;
}

/** Inner-join two daily series on date so both legs share a calendar. */
export function alignSeries(s1: DailySeries, s2: DailySeries): AlignedPair {
  const idx = new Map<string, number>();
  s2.dates.forEach((d, i) => idx.set(d, i));

  const dates: string[] = [];
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < s1.dates.length; i++) {
    const j = idx.get(s1.dates[i]);
    if (j !== undefined) {
      dates.push(s1.dates[i]);
      a.push(s1.closes[i]);
      b.push(s2.closes[j]);
    }
  }
  if (dates.length < 30) {
    throw new Error("fewer than 30 overlapping trading days between the two symbols");
  }
  return { dates, a: Float64Array.from(a), b: Float64Array.from(b) };
}

export function logPrices(p: Float64Array): Float64Array {
  const out = new Float64Array(p.length);
  for (let i = 0; i < p.length; i++) out[i] = Math.log(p[i]);
  return out;
}
