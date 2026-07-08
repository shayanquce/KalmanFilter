// Numerical sanity checks for the filter implementations, run on synthetic
// data with known ground truth. Not a unit test suite, a smoke test that the
// recursions are wired correctly.

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
function gauss() {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Inline ports of the TS implementations (kept in sync by eye; the source of
// truth is src/lib/kalman.ts and this file mirrors its arithmetic exactly).
function runLocalLevel(y, q, r) {
  const n = y.length;
  let x = y[0];
  let p = r * 10;
  const filtered = new Float64Array(n);
  for (let t = 0; t < n; t++) {
    const pPred = p + q;
    const k = pPred / (pPred + r);
    x = x + k * (y[t] - x);
    p = (1 - k) * pPred;
    filtered[t] = x;
  }
  return filtered;
}

function runDynamicRegression(y, x, delta, r) {
  const n = y.length;
  const qScale = delta / (1 - delta);
  let a = 0, b = 0, p00 = 1, p01 = 0, p11 = 1;
  const beta = new Float64Array(n);
  const z = new Float64Array(n);
  for (let t = 0; t < n; t++) {
    p00 += qScale;
    p11 += qScale;
    const h1 = x[t];
    const e = y[t] - (a + b * h1);
    const ph0 = p00 + p01 * h1;
    const ph1 = p01 + p11 * h1;
    const s = ph0 + ph1 * h1 + r;
    const k0 = ph0 / s;
    const k1 = ph1 / s;
    a += k0 * e;
    b += k1 * e;
    const n00 = p00 - k0 * ph0, n01 = p01 - k0 * ph1, n11 = p11 - k1 * ph1;
    p00 = n00; p01 = n01; p11 = n11;
    beta[t] = b;
    z[t] = e / Math.sqrt(s);
  }
  return { beta, z };
}

// Test 1: local level. True level is a slow random walk, observations add
// noise with 10x the variance. The filter should cut RMSE well below raw.
{
  const n = 2000, q = 0.01, r = 0.1;
  const truth = new Float64Array(n);
  const obs = new Float64Array(n);
  let level = 100;
  for (let t = 0; t < n; t++) {
    level += Math.sqrt(q) * gauss();
    truth[t] = level;
    obs[t] = level + Math.sqrt(r) * gauss();
  }
  const filt = runLocalLevel(obs, q, r);
  let rawErr = 0, filtErr = 0;
  for (let t = 100; t < n; t++) {
    rawErr += (obs[t] - truth[t]) ** 2;
    filtErr += (filt[t] - truth[t]) ** 2;
  }
  const rmseRaw = Math.sqrt(rawErr / (n - 100));
  const rmseFilt = Math.sqrt(filtErr / (n - 100));
  console.log(`local level: raw RMSE ${rmseRaw.toFixed(4)}, filtered RMSE ${rmseFilt.toFixed(4)}`);
  if (!(rmseFilt < 0.6 * rmseRaw)) {
    console.error("FAIL: filter did not reduce error vs raw observations");
    process.exit(1);
  }
}

// Test 2: dynamic regression. True beta drifts from 1.0 to 2.0 linearly.
// The filter should track it closely and the z-scores should be near N(0,1).
{
  const n = 2000, r = 0.0025;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const trueBeta = new Float64Array(n);
  let xv = 4;
  for (let t = 0; t < n; t++) {
    xv += 0.02 * gauss();
    x[t] = xv;
    trueBeta[t] = 1 + t / (n - 1);
    y[t] = 0.5 + trueBeta[t] * xv + Math.sqrt(r) * gauss();
  }
  const { beta, z } = runDynamicRegression(y, x, 1e-4, r);
  let err = 0;
  for (let t = 200; t < n; t++) err += (beta[t] - trueBeta[t]) ** 2;
  const rmse = Math.sqrt(err / (n - 200));
  let zMean = 0, zv = 0;
  for (let t = 200; t < n; t++) zMean += z[t];
  zMean /= n - 200;
  for (let t = 200; t < n; t++) zv += (z[t] - zMean) ** 2;
  zv /= n - 200;
  console.log(`dynamic regression: beta RMSE ${rmse.toFixed(4)} (beta spans 1 to 2), z mean ${zMean.toFixed(3)}, z var ${zv.toFixed(3)}`);
  if (!(rmse < 0.1)) {
    console.error("FAIL: beta tracking error too large");
    process.exit(1);
  }
  if (!(Math.abs(zMean) < 0.15 && zv > 0.5 && zv < 2)) {
    console.error("FAIL: standardized innovations not close to N(0,1)");
    process.exit(1);
  }
}

console.log("all filter checks pass");
