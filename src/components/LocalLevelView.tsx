import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipProps } from "recharts";
import { fetchDailySeries, type DailySeries } from "../lib/data";
import { diffVariance, runLocalLevel } from "../lib/kalman";
import { fmtDateTick, fmtNum, fmtSci, isoDaysAgo, isoToday, pickTicks } from "../lib/format";
import { Tex } from "./Tex";

interface Row {
  date: string;
  observed: number;
  filtered: number;
  band: [number, number];
  gain: number;
  zInnov: number;
}

function PriceTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as Row;
  return (
    <div className="tt">
      <div className="tt-date">{row.date}</div>
      <div className="tt-row"><span className="lbl">close</span><span className="val">{fmtNum(row.observed)}</span></div>
      <div className="tt-row"><span className="lbl">filtered</span><span className="val">{fmtNum(row.filtered)}</span></div>
      <div className="tt-row"><span className="lbl">95% band</span><span className="val">{fmtNum(row.band[0])} / {fmtNum(row.band[1])}</span></div>
      <div className="tt-row"><span className="lbl">gain K</span><span className="val">{fmtNum(row.gain, 3)}</span></div>
    </div>
  );
}

function InnovTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as Row;
  return (
    <div className="tt">
      <div className="tt-date">{row.date}</div>
      <div className="tt-row"><span className="lbl">std. innovation</span><span className="val">{fmtNum(row.zInnov, 2)}</span></div>
    </div>
  );
}

export default function LocalLevelView() {
  const [ticker, setTicker] = useState("SPY");
  const [start, setStart] = useState(isoDaysAgo(730));
  const [end, setEnd] = useState(isoToday());
  const [logRatio, setLogRatio] = useState(-2.5); // log10(Q/R)
  const [series, setSeries] = useState<DailySeries | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSeries(await fetchDailySeries(ticker.trim().toUpperCase(), start, end));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSeries(null);
    } finally {
      setLoading(false);
    }
  }, [ticker, start, end]);

  useEffect(() => {
    void run();
    // Fetch once on mount with the defaults. Later runs are user-triggered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const model = useMemo(() => {
    if (!series) return null;
    // R is seeded from the variance of daily changes. Splitting it evenly
    // between process and observation noise is the neutral starting point;
    // the slider then moves Q relative to that R.
    const r = Math.max(diffVariance(series.closes) / 2, 1e-12);
    const q = r * Math.pow(10, logRatio);
    const out = runLocalLevel(series.closes, q, r);
    const rows: Row[] = series.dates.map((date, i) => {
      const sd = Math.sqrt(out.variance[i]);
      return {
        date,
        observed: series.closes[i],
        filtered: out.filtered[i],
        band: [out.filtered[i] - 1.96 * sd, out.filtered[i] + 1.96 * sd],
        gain: out.gain[i],
        zInnov: out.innovation[i] / Math.sqrt(out.innovationVariance[i]),
      };
    });
    return { rows, q, r, out };
  }, [series, logRatio]);

  const ticks = useMemo(
    () => (model ? pickTicks(model.rows.map((r) => r.date)) : []),
    [model],
  );

  const last = model ? model.rows[model.rows.length - 1] : null;

  return (
    <div className="view">
      <p className="view-lede">
        The observed close is treated as a noisy measurement of a hidden price level that
        follows a random walk. The filter updates one print at a time, so the estimate at
        each date uses only information available on that date. No lookback window, no
        smoothing across the future.
      </p>

      <div className="panel">
        <div className="controls">
          <div className="field">
            <label htmlFor="ll-ticker">Ticker</label>
            <input
              id="ll-ticker"
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              spellCheck={false}
            />
          </div>
          <div className="field">
            <label htmlFor="ll-start">Start</label>
            <input id="ll-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="ll-end">End</label>
            <input id="ll-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div className="field slider-field">
            <label htmlFor="ll-ratio">Noise ratio, log&#8321;&#8320;(Q / R)</label>
            <div className="slider-row">
              <input
                id="ll-ratio"
                type="range"
                min={-5}
                max={0.5}
                step={0.1}
                value={logRatio}
                onChange={(e) => setLogRatio(Number(e.target.value))}
              />
              <span className="slider-value">{fmtNum(logRatio, 1)}</span>
            </div>
            <div className="slider-caption">
              Left trusts the model (smoother, slower). Right trusts each print (faster, noisier).
            </div>
          </div>
          <button className="run-btn" onClick={() => void run()} disabled={loading}>
            {loading ? "Loading" : "Run"}
          </button>
        </div>
        {error && <div className="error-box">{error}</div>}
      </div>

      {loading && !model && <div className="loading-note">fetching daily closes...</div>}

      {model && last && (
        <>
          <div className="readout">
            <div className="readout-cell">
              <div className="k">Last close</div>
              <div className="v">{fmtNum(last.observed)}</div>
              <div className="sub">{last.date} &middot; {series?.source}</div>
            </div>
            <div className="readout-cell">
              <div className="k">Filtered level</div>
              <div className="v accent">{fmtNum(last.filtered)}</div>
              <div className="sub">&plusmn;{fmtNum(1.96 * Math.sqrt(model.out.variance[model.rows.length - 1]))} at 95%</div>
            </div>
            <div className="readout-cell">
              <div className="k">Steady-state gain</div>
              <div className="v">{fmtNum(last.gain, 3)}</div>
              <div className="sub">share of innovation absorbed</div>
            </div>
            <div className="readout-cell">
              <div className="k">Q</div>
              <div className="v">{fmtSci(model.q)}</div>
              <div className="sub">process noise var</div>
            </div>
            <div className="readout-cell">
              <div className="k">R</div>
              <div className="v">{fmtSci(model.r)}</div>
              <div className="sub">observation noise var</div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">
              <span>{series?.symbol} close vs filtered level</span>
              <span className="hint">band is the 95% interval from the state covariance</span>
            </div>
            <div className="legend">
              <span className="legend-item"><span className="legend-swatch" style={{ background: "var(--observed)" }} />observed close</span>
              <span className="legend-item"><span className="legend-swatch" style={{ background: "var(--accent)" }} />filtered estimate</span>
              <span className="legend-item"><span className="legend-swatch band" style={{ background: "var(--accent)" }} />95% band</span>
            </div>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={360}>
                <ComposedChart data={model.rows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#161d25" vertical={false} />
                  <XAxis
                    dataKey="date"
                    ticks={ticks}
                    tickFormatter={fmtDateTick}
                    tick={{ fill: "#78838e", fontSize: 11, fontFamily: "var(--mono)" }}
                    axisLine={{ stroke: "#1f2831" }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    tickFormatter={(v: number) => fmtNum(v, 0)}
                    tick={{ fill: "#78838e", fontSize: 11, fontFamily: "var(--mono)" }}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                  />
                  <Tooltip content={<PriceTooltip />} cursor={{ stroke: "#2c3843" }} />
                  <Area dataKey="band" stroke="none" fill="var(--accent)" fillOpacity={0.1} isAnimationActive={false} />
                  <Line dataKey="observed" stroke="var(--observed)" strokeWidth={1} dot={false} isAnimationActive={false} />
                  <Line dataKey="filtered" stroke="var(--accent)" strokeWidth={1.6} dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">
              <span>Standardized innovations</span>
              <span className="hint">
                <Tex tex="e_t / \sqrt{S_t}" />, should look like white noise if Q and R are sane
              </span>
            </div>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={model.rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#161d25" vertical={false} />
                  <XAxis
                    dataKey="date"
                    ticks={ticks}
                    tickFormatter={fmtDateTick}
                    tick={{ fill: "#78838e", fontSize: 11, fontFamily: "var(--mono)" }}
                    axisLine={{ stroke: "#1f2831" }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v: number) => fmtNum(v, 0)}
                    tick={{ fill: "#78838e", fontSize: 11, fontFamily: "var(--mono)" }}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                  />
                  <Tooltip content={<InnovTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                  <ReferenceLine y={0} stroke="#2c3843" />
                  <Bar dataKey="zInnov" isAnimationActive={false}>
                    {model.rows.map((r) => (
                      <Cell key={r.date} fill={r.zInnov >= 0 ? "var(--green)" : "var(--red)"} fillOpacity={0.75} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
