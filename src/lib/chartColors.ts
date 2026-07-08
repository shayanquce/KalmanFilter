// Chart palette as hex literals. SVG presentation attributes (stroke, fill)
// do not resolve CSS var(), the browser drops the attribute and the series
// silently disappears, so charts must never reference CSS variables.

export const C = {
  // series
  price: "#a9b7c3",   // observed close, light steel so the tape is clearly visible
  est: "#3fc1f0",     // Kalman estimate, bright cyan, the star of every chart
  estBandOpacity: 0.12,
  ols: "#e0904a",     // rolling OLS comparison, muted orange, dashed
  green: "#2fc98c",
  red: "#f05650",
  neutral: "#48566388", // z bars inside the entry threshold

  // chrome
  grid: "#1a232d",
  axis: "#8593a1",
  zero: "#2b3742",
  cursor: "#34414e",
  cursorFill: "rgba(255,255,255,0.04)",
} as const;

export const AXIS_TICK = {
  fill: C.axis,
  fontSize: 11,
  fontFamily: "'IBM Plex Mono', Consolas, monospace",
} as const;
