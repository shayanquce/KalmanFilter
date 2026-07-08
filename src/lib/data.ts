// Market data layer. Daily adjusted closes from the Yahoo Finance chart
// endpoint, reached through the Vite dev proxy at /api/market to avoid CORS.

export interface DailySeries {
  symbol: string;
  dates: string[]; // ISO yyyy-mm-dd
  closes: Float64Array;
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

export async function fetchDailySeries(
  symbol: string,
  startDate: string,
  endDate: string,
): Promise<DailySeries> {
  const period1 = Math.floor(new Date(startDate + "T00:00:00Z").getTime() / 1000);
  const period2 = Math.floor(new Date(endDate + "T23:59:59Z").getTime() / 1000);
  const url =
    `/api/market/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?period1=${period1}&period2=${period2}&interval=1d&events=div%2Csplit`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${symbol}: data request failed (HTTP ${res.status})`);
  }
  const json = (await res.json()) as YahooChartResponse;
  if (json.chart.error) {
    throw new Error(`${symbol}: ${json.chart.error.description}`);
  }
  const result = json.chart.result?.[0];
  if (!result || !result.timestamp?.length) {
    throw new Error(`${symbol}: no data returned for this range`);
  }

  const raw =
    result.indicators.adjclose?.[0]?.adjclose ??
    result.indicators.quote[0].close;

  const dates: string[] = [];
  const closes: number[] = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const c = raw[i];
    if (c != null && Number.isFinite(c)) {
      dates.push(toIsoDate(result.timestamp[i]));
      closes.push(c);
    }
  }
  if (closes.length < 30) {
    throw new Error(`${symbol}: only ${closes.length} valid observations, need at least 30`);
  }
  return { symbol, dates, closes: Float64Array.from(closes) };
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
