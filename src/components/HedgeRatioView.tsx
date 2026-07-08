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
import { alignSeries, fetchDailySeries, logPrices, type AlignedPair } from "../lib/data";
import { rollingOlsBeta, runDynamicRegression } from "../lib/kalman";
import { fmtDateTick, fmtNum, fmtSci, isoDaysAgo, isoToday, pickTicks } from "../lib/format";
import { Tex } from "./Tex";

const OLS_WINDOW = 60;

interface Row {
  date: string;
  beta: number;
  band: [number, number];
  ols: number | null;
  z: number;
  alpha: number;
}

function BetaTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as Row;
  return (
    <div className="tt">
      <div className="tt-date">{row.date}</div>
      <div className="tt-row"><span className="lbl">kalman &beta;</span><span className="val">{fmtNum(row.beta, 4)}</span></div>
      <div className="tt-row"><span className="lbl">95% band</span><span className="val">{fmtNum(row.band[0], 4)} / {fmtNum(row.band[1], 4)}</span></div>
      <div className="tt-row">
        <span className="lbl">rolling OLS</span>
        <span className="val">{row.ols == null ? "warming up" : fmtNum(row.ols, 4)}</span>
      </div>
    </div>
  );
}

function ZTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as Row;
  return (
    <div className="tt">
      <div className="tt-date">{row.date}</div>
      <div className="tt-row"><span className="lbl">z-score</span><span className="val">{fmtNum(row.z, 2)}</span></div>
    </div>
  );
}

const axisTick = { fill: "#78838e", fontSize: 11, fontFamily: "var(--mono)" } as const;

export default function HedgeRatioView() {
  const [tickerY, setTickerY] = useState("KO");
  const [tickerX, setTickerX] = useState("PEP");
  const [start, setStart] = useState(isoDaysAgo(1095));
  const [end, setEnd] = useState(isoToday());
  const [logDelta, setLogDelta] = useState(-5); // log10 of delta
  const [logR, setLogR] = useState(-4); // log10 of observation noise variance
  const [pair, setPair] = useState<AlignedPair & { yName: string; xName: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const yName = tickerY.trim().toUpperCase();
      const xName = tickerX.trim().toUpperCase();
      const [sy, sx] = await Promise.all([
        fetchDailySeries(yName, start, end),
        fetchDailySeries(xName, start, end),
      ]);
      setPair({ ...alignSeries(sy, sx), yName, xName });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPair(null);
    } finally {
      setLoading(false);
    }
  }, [tickerY, tickerX, start, end]);

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const model = useMemo(() => {
    if (!pair) return null;
    // Log prices, so beta is the ratio of percentage moves and the spread is
    // scale-free. This matches how the pair would actually be traded.
    const y = logPrices(pair.a);
    const x = logPrices(pair.b);
    const delta = Math.pow(10, logDelta);
    const r = Math.pow(10, logR);
    const out = runDynamicRegression(y, x, delta, r);
    const ols = rollingOlsBeta(y, x, OLS_WINDOW);

    // Drop the burn-in where the diffuse prior still dominates.
    const burn = Math.min(20, Math.floor(pair.dates.length / 10));
    const rows: Row[] = [];
    for (let i = burn; i < pair.dates.length; i++) {
      const sd = Math.sqrt(out.betaVariance[i]);
      rows.push({
        date: pair.dates[i],
        beta: out.beta[i],
        band: [out.beta[i] - 1.96 * sd, out.beta[i] + 1.96 * sd],
        ols: Number.isNaN(ols[i]) ? null : ols[i],
        z: out.zScore[i],
        alpha: out.alpha[i],
      });
    }
    return { rows, out, delta, r, burn };
  }, [pair, logDelta, logR]);

  const ticks = useMemo(
    () => (model ? pickTicks(model.rows.map((r) => r.date)) : []),
    [model],
  );

  const last = model ? model.rows[model.rows.length - 1] : null;

  return (
    <div className="view">
      <p className="view-lede">
        Regression where the coefficients are the hidden state:{" "}
        <Tex tex={String.raw`\log P^{Y}_t = \alpha_t + \beta_t \log P^{X}_t + v_t`} />,
        with alpha and beta allowed to drift as random walks. The filter re-estimates
        the hedge ratio on every print instead of refitting OLS over a fixed window. The
        standardized innovation below is the entry signal a stat arb desk would monitor.
      </p>

      <div className="panel">
        <div className="controls">
          <div className="field">
            <label htmlFor="hr-y">Ticker Y (dependent)</label>
            <input id="hr-y" type="text" value={tickerY} onChange={(e) => setTickerY(e.target.value)} spellCheck={false} />
          </div>
          <div className="field">
            <label htmlFor="hr-x">Ticker X (hedge leg)</label>
            <input id="hr-x" type="text" value={tickerX} onChange={(e) => setTickerX(e.target.value)} spellCheck={false} />
          </div>
          <div className="field">
            <label htmlFor="hr-start">Start</label>
            <input id="hr-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="hr-end">End</label>
            <input id="hr-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div className="field slider-field">
            <label htmlFor="hr-delta">State drift, log&#8321;&#8320;(delta)</label>
            <div className="slider-row">
              <input
                id="hr-delta"
                type="range"
                min={-8}
                max={-2}
                step={0.1}
                value={logDelta}
                onChange={(e) => setLogDelta(Number(e.target.value))}
              />
              <span className="slider-value">{fmtNum(logDelta, 1)}</span>
            </div>
            <div className="slider-caption">
              How fast beta is allowed to move.{" "}
              <Tex tex={String.raw`\mathbf{Q} = \tfrac{\delta}{1-\delta}\mathbf{I}`} />
            </div>
          </div>
          <div className="field slider-field">
            <label htmlFor="hr-r">Observation noise, log&#8321;&#8320;(R)</label>
            <div className="slider-row">
              <input
                id="hr-r"
                type="range"
                min={-7}
                max={-1}
                step={0.1}
                value={logR}
                onChange={(e) => setLogR(Number(e.target.value))}
              />
              <span className="slider-value">{fmtNum(logR, 1)}</span>
            </div>
            <div className="slider-caption">
              Variance of the pricing error around the fitted spread, in log-price units.
            </div>
          </div>
          <button className="run-btn" onClick={() => void run()} disabled={loading}>
            {loading ? "Loading" : "Run"}
          </button>
        </div>
        {error && <div className="error-box">{error}</div>}
      </div>

      {loading && !model && <div className="loading-note">fetching both legs...</div>}

      {model && last && pair && (
        <>
          <div className="readout">
            <div className="readout-cell">
              <div className="k">Pair</div>
              <div className="v">{pair.yName} / {pair.xName}</div>
              <div className="sub">{model.rows.length} obs after burn-in</div>
            </div>
            <div className="readout-cell">
              <div className="k">Hedge ratio (beta)</div>
              <div className="v accent">{fmtNum(last.beta, 4)}</div>
              <div className="sub">{fmtNum(last.band[0], 3)} to {fmtNum(last.band[1], 3)} at 95%</div>
            </div>
            <div className="readout-cell">
              <div className="k">Z-score today</div>
              <div className={`v ${Math.abs(last.z) >= 2 ? (last.z > 0 ? "neg" : "pos") : ""}`}>
                {fmtNum(last.z, 2)}
              </div>
              <div className="sub">
                {Math.abs(last.z) >= 2
                  ? last.z > 0
                    ? "rich: short Y, long X"
                    : "cheap: long Y, short X"
                  : "inside entry threshold"}
              </div>
            </div>
            <div className="readout-cell">
              <div className="k">Delta</div>
              <div className="v">{fmtSci(model.delta)}</div>
              <div className="sub">state drift</div>
            </div>
            <div className="readout-cell">
              <div className="k">R</div>
              <div className="v">{fmtSci(model.r)}</div>
              <div className="sub">obs noise var</div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">
              <span>
                Time-varying hedge ratio <Tex tex={String.raw`\beta_t`} />
              </span>
              <span className="hint">Kalman estimate vs {OLS_WINDOW}-day rolling OLS</span>
            </div>
            <div className="legend">
              <span className="legend-item"><span className="legend-swatch" style={{ background: "var(--accent)" }} />kalman &beta;</span>
              <span className="legend-item"><span className="legend-swatch band" style={{ background: "var(--accent)" }} />95% band</span>
              <span className="legend-item"><span className="legend-swatch" style={{ background: "var(--ols)", height: 1 }} />rolling OLS ({OLS_WINDOW}d)</span>
            </div>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={340}>
                <ComposedChart data={model.rows} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#161d25" vertical={false} />
                  <XAxis
                    dataKey="date"
                    ticks={ticks}
                    tickFormatter={fmtDateTick}
                    tick={axisTick}
                    axisLine={{ stroke: "#1f2831" }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    tickFormatter={(v: number) => fmtNum(v, 2)}
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                    width={56}
                  />
                  <Tooltip content={<BetaTooltip />} cursor={{ stroke: "#2c3843" }} />
                  <Area dataKey="band" stroke="none" fill="var(--accent)" fillOpacity={0.12} isAnimationActive={false} />
                  <Line
                    dataKey="ols"
                    stroke="var(--ols)"
                    strokeWidth={1}
                    strokeDasharray="4 3"
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  <Line dataKey="beta" stroke="var(--accent)" strokeWidth={1.6} dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">
              <span>Spread z-score</span>
              <span className="hint">
                <Tex tex="z_t = e_t / \sqrt{S_t}" />, entries beyond &plusmn;2 highlighted
              </span>
            </div>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={model.rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="#161d25" vertical={false} />
                  <XAxis
                    dataKey="date"
                    ticks={ticks}
                    tickFormatter={fmtDateTick}
                    tick={axisTick}
                    axisLine={{ stroke: "#1f2831" }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v: number) => fmtNum(v, 0)}
                    tick={axisTick}
                    axisLine={false}
                    tickLine={false}
                    width={56}
                  />
                  <Tooltip content={<ZTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                  <ReferenceLine y={0} stroke="#2c3843" />
                  <ReferenceLine y={2} stroke="var(--red)" strokeDasharray="3 3" strokeOpacity={0.6} />
                  <ReferenceLine y={-2} stroke="var(--green)" strokeDasharray="3 3" strokeOpacity={0.6} />
                  <Bar dataKey="z" isAnimationActive={false}>
                    {model.rows.map((r) => (
                      <Cell
                        key={r.date}
                        fill={r.z >= 2 ? "var(--red)" : r.z <= -2 ? "var(--green)" : "#3a4552"}
                        fillOpacity={Math.abs(r.z) >= 2 ? 0.95 : 0.6}
                      />
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
