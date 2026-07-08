// Kalman filter implementations for the two models in this app.
//
// Model A, local level: scalar hidden state (the "true" price level) following
// a random walk, observed through additive noise.
//
// Model B, dynamic regression: 2-vector hidden state (intercept, hedge ratio)
// following a random walk, observed through the time-varying regression
// y_t = alpha_t + beta_t * x_t + noise. The observation matrix changes every
// step because it contains the regressor price, which is what makes this a
// Kalman regression rather than a plain smoother.

export interface LocalLevelOutput {
  /** One-step-ahead prediction of the level before seeing y_t */
  predicted: Float64Array;
  /** Filtered estimate of the level after absorbing y_t */
  filtered: Float64Array;
  /** Filtered state variance P_t|t */
  variance: Float64Array;
  /** Kalman gain at each step */
  gain: Float64Array;
  /** Innovation y_t minus prediction */
  innovation: Float64Array;
  /** Innovation variance S_t, for standardizing the innovation */
  innovationVariance: Float64Array;
}

export function runLocalLevel(
  y: Float64Array | number[],
  q: number,
  r: number,
): LocalLevelOutput {
  const n = y.length;
  const predicted = new Float64Array(n);
  const filtered = new Float64Array(n);
  const variance = new Float64Array(n);
  const gain = new Float64Array(n);
  const innovation = new Float64Array(n);
  const innovationVariance = new Float64Array(n);

  // Diffuse-ish initialization: start at the first print with high
  // uncertainty so the filter locks on within a few observations instead of
  // dragging the initial guess for weeks.
  let x = y[0];
  let p = r * 10;

  for (let t = 0; t < n; t++) {
    // Predict
    const xPred = x;
    const pPred = p + q;

    // Update
    const s = pPred + r;
    const k = pPred / s;
    const innov = y[t] - xPred;

    x = xPred + k * innov;
    p = (1 - k) * pPred;

    predicted[t] = xPred;
    filtered[t] = x;
    variance[t] = p;
    gain[t] = k;
    innovation[t] = innov;
    innovationVariance[t] = s;
  }

  return { predicted, filtered, variance, gain, innovation, innovationVariance };
}

export interface DynamicRegressionOutput {
  alpha: Float64Array;
  beta: Float64Array;
  /** Filtered variance of beta, diagonal (1,1) entry of P_t|t */
  betaVariance: Float64Array;
  /** Innovation e_t = y_t minus predicted y */
  innovation: Float64Array;
  /** Innovation variance S_t */
  innovationVariance: Float64Array;
  /** Standardized innovation e_t / sqrt(S_t), the stat arb entry signal */
  zScore: Float64Array;
  /** Model-implied spread y_t - alpha_t - beta_t x_t using filtered state */
  spread: Float64Array;
}

/**
 * Kalman filter regression of y on x with random-walk coefficients.
 *
 * Parametrized the way Ernie Chan does it: delta in (0,1) sets the process
 * noise as Q = delta / (1 - delta) * I, and r is the observation noise
 * variance. Small delta means the hedge ratio is believed to be nearly
 * constant; larger delta lets it move fast.
 */
export function runDynamicRegression(
  y: Float64Array | number[],
  x: Float64Array | number[],
  delta: number,
  r: number,
): DynamicRegressionOutput {
  const n = y.length;
  if (x.length !== n) throw new Error("series length mismatch");

  const alpha = new Float64Array(n);
  const beta = new Float64Array(n);
  const betaVariance = new Float64Array(n);
  const innovation = new Float64Array(n);
  const innovationVariance = new Float64Array(n);
  const zScore = new Float64Array(n);
  const spread = new Float64Array(n);

  const qScale = delta / (1 - delta);

  // State [alpha, beta] and covariance P as explicit scalars, since a 2x2
  // recursion does not need a matrix library.
  let a = 0;
  let b = 0;
  let p00 = 1;
  let p01 = 0;
  let p11 = 1;

  for (let t = 0; t < n; t++) {
    // Predict: F = I, so the state carries over and Q is added to P.
    p00 += qScale;
    p11 += qScale;

    // Observation row H_t = [1, x_t]
    const h1 = x[t] as number;

    // Innovation and its variance S = H P H' + R
    const yPred = a + b * h1;
    const e = (y[t] as number) - yPred;
    const ph0 = p00 + p01 * h1; // (P H')[0]
    const ph1 = p01 + p11 * h1; // (P H')[1]
    const s = ph0 + ph1 * h1 + r;

    // Gain K = P H' / S
    const k0 = ph0 / s;
    const k1 = ph1 / s;

    // State update
    a += k0 * e;
    b += k1 * e;

    // Covariance update P = (I - K H) P, expanded for the 2x2 case
    const newP00 = p00 - k0 * ph0;
    const newP01 = p01 - k0 * ph1;
    const newP11 = p11 - k1 * ph1;
    p00 = newP00;
    p01 = newP01;
    p11 = newP11;

    alpha[t] = a;
    beta[t] = b;
    betaVariance[t] = p11;
    innovation[t] = e;
    innovationVariance[t] = s;
    zScore[t] = e / Math.sqrt(s);
    spread[t] = (y[t] as number) - a - b * h1;
  }

  return { alpha, beta, betaVariance, innovation, innovationVariance, zScore, spread };
}

/**
 * Rolling-window OLS beta of y on x, the baseline the Kalman regression is
 * compared against. Returns NaN until the window fills.
 */
export function rollingOlsBeta(
  y: Float64Array | number[],
  x: Float64Array | number[],
  window: number,
): Float64Array {
  const n = y.length;
  const out = new Float64Array(n).fill(NaN);
  for (let t = window - 1; t < n; t++) {
    let sx = 0;
    let sy = 0;
    for (let i = t - window + 1; i <= t; i++) {
      sx += x[i] as number;
      sy += y[i] as number;
    }
    const mx = sx / window;
    const my = sy / window;
    let sxx = 0;
    let sxy = 0;
    for (let i = t - window + 1; i <= t; i++) {
      const dx = (x[i] as number) - mx;
      sxx += dx * dx;
      sxy += dx * ((y[i] as number) - my);
    }
    out[t] = sxx > 0 ? sxy / sxx : NaN;
  }
  return out;
}

/** Sample variance of first differences, used to seed the R estimate. */
export function diffVariance(y: Float64Array | number[]): number {
  const n = y.length;
  if (n < 3) return 1;
  let mean = 0;
  for (let i = 1; i < n; i++) mean += (y[i] as number) - (y[i - 1] as number);
  mean /= n - 1;
  let v = 0;
  for (let i = 1; i < n; i++) {
    const d = (y[i] as number) - (y[i - 1] as number) - mean;
    v += d * d;
  }
  return v / (n - 2);
}
