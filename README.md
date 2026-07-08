# Kalman Terminal

Two Kalman filter applications on real market data, in one app:

- **Local Level.** Treats the daily close as a noisy measurement of a hidden price level and recovers a real-time, noise-filtered estimate with a 95% confidence band. Recursive, one observation at a time, no lookback window.
- **Hedge Ratio.** The centerpiece. A Kalman filter regression that estimates a time-varying hedge ratio (beta) between two correlated tickers, with the regression coefficients modeled as a random-walk hidden state. This is the technique used in real pairs trading and stat arb research (Ernie Chan's parametrization). Includes a 60-day rolling OLS overlay for comparison and the standardized innovation z-score used as an entry signal.

The full derivation is in the Methodology tab of the app and in [`docs/methodology.md`](docs/methodology.md).

## Run it

```
npm install
npm run dev
```

Then open the URL Vite prints (default `http://localhost:5173`). That is the whole setup, one install command and one run command.

## Architecture choices

**Filter math in TypeScript, no Python backend.** The two filters here are a scalar recursion and a 2x2 matrix recursion. Numpy buys nothing at that size, and dropping the second service means one process, one install, one command, and a trivial deploy. The implementations live in `src/lib/kalman.ts` and are written directly against the update equations, so they double as readable reference code.

**Data from the Yahoo Finance chart endpoint, proxied through Vite, with failover.** The endpoint is free, keyless, and returns split- and dividend-adjusted daily closes. It does not send CORS headers, so the dev server proxies it (see `vite.config.ts`). No API key to manage and no daily request cap, which is why it was chosen over Alpha Vantage (25 requests/day on the free tier) and Finnhub (historical candles are a paid endpoint now).

To keep one flaky or blocked host from taking the app down, `fetchDailySeries` in `src/lib/data.ts` tries three sources in order, each with one retry:

1. Yahoo host `query1` (proxied at `/api/yahoo1`)
2. Yahoo host `query2` (proxied at `/api/yahoo2`)
3. Alpha Vantage (proxied at `/api/av`), used only if you save a key

The Alpha Vantage step is the escape hatch for networks that firewall Yahoo Finance, since it is a different domain. Open the Data menu in the top bar, paste a free key, and it is stored in your browser (localStorage) and used as a fallback only. The readout strip shows which source actually answered.

To swap in a different provider, replace the source functions in `src/lib/data.ts`. Each returns `{ symbol, dates, closes, source }` with ISO dates and adjusted closes, and everything downstream keeps working.

**Note on production deploys.** The Vite proxy exists only in the dev server. If you deploy the built app, put the same rewrite on your host (a Vercel rewrite, a Netlify redirect, or any small reverse proxy) or switch the data layer to a keyed API that sends CORS headers.

## Changing the ticker pair

Type any two Yahoo Finance symbols into the Hedge Ratio tab and hit Run. Sensible starting pairs: `KO`/`PEP`, `XOM`/`CVX`, `V`/`MA`, `GLD`/`GDX`, `EWA`/`EWC` (the pair from Chan's book). The dependent leg is Y and the hedge leg is X, so beta answers "how many units of X hedge one unit of Y" in log-price (percentage) terms. The two series are inner-joined on trading date before filtering, so cross-listed pairs with different holiday calendars work fine.

## Tuning

- **log10(Q/R)** on the Local Level tab moves the filter between smooth-but-lagging (left) and responsive-but-noisy (right).
- **log10(delta)** on the Hedge Ratio tab sets how fast beta may drift, via Q = delta / (1 - delta) * I. Around -5 is a reasonable default for stable large-cap pairs.
- **log10(R)** on the Hedge Ratio tab is the observation noise variance in log-price units. Around -4 is a reasonable default for daily data.

The standardized innovation charts are the diagnostic: if the bars look like white noise, the noise assumptions are consistent with the data.

## Stack

React 18, TypeScript, Vite 5, Recharts for charts, KaTeX for math rendering. Filters and rolling OLS are dependency-free TypeScript in `src/lib/`.
