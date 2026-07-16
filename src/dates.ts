/**
 * Date helpers. outl daily pages and Oura's API both key on ISO `YYYY-MM-DD`.
 */

/** Format a `Date` as local-time ISO `YYYY-MM-DD`. */
export function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * The last `days` ISO dates ending today, most recent first
 * (e.g. days=3 → ["2025-11-29", "2025-11-28", "2025-11-27"]).
 */
export function buildDateRange(days: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push(isoDate(d));
  }
  return out;
}

/** Extract the ISO date (`YYYY-MM-DD`) from an ISO timestamp, or `undefined`. */
export function dateFromTimestamp(ts?: string): string | undefined {
  if (!ts) return undefined;
  const m = ts.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : undefined;
}

/** `YYYY-MM-DD` sanity check for values from the Oura API. */
export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
