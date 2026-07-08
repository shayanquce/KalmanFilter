export function fmtNum(v: number, dp = 2): string {
  if (!Number.isFinite(v)) return "n/a";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

export function fmtSci(v: number): string {
  if (!Number.isFinite(v) || v === 0) return "0";
  const exp = Math.floor(Math.log10(Math.abs(v)));
  if (exp >= -2 && exp <= 3) return fmtNum(v, Math.max(0, 3 - exp));
  const mant = v / Math.pow(10, exp);
  return `${mant.toFixed(2)}e${exp}`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2024-03-08" to "Mar '24", for axis ticks. */
export function fmtDateTick(iso: string): string {
  const m = Number(iso.slice(5, 7)) - 1;
  const y = iso.slice(2, 4);
  return `${MONTHS[m]} '${y}`;
}

/** Pick roughly n evenly spaced dates for explicit axis ticks. */
export function pickTicks(dates: string[], n = 6): string[] {
  if (dates.length <= n) return [...dates];
  const out: string[] = [];
  const step = (dates.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) out.push(dates[Math.round(i * step)]);
  return out;
}

export function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
