/**
 * Pure formatting helpers. They turn raw Oura numbers into the compact strings
 * that make up a day's summary lines. Every one returns `undefined` for a
 * missing/invalid input so callers can drop empty parts.
 */

/** True for a real, non-NaN number. */
export function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}

/** `52` → `"52"`, with an optional unit suffix (`"52 ms"`). */
export function num(value?: number | null, suffix?: string): string | undefined {
  if (!isValidNumber(value)) return undefined;
  return suffix ? `${value} ${suffix}` : `${value}`;
}

/** `92` → `"92%"`. */
export function pct(value?: number | null): string | undefined {
  if (!isValidNumber(value)) return undefined;
  return `${value}%`;
}

/** Seconds → `"7h 32m"` / `"45m"`. */
export function duration(seconds?: number | null): string | undefined {
  if (!isValidNumber(seconds)) return undefined;
  const total = Math.round(seconds / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

/** Meters → `"5.20 km"`. */
export function km(meters?: number | null): string | undefined {
  if (!isValidNumber(meters)) return undefined;
  return `${(meters / 1000).toFixed(2)} km`;
}

/** Signed temperature deviation → `"+0.15°C"`. */
export function tempDeviation(value?: number | null): string | undefined {
  if (!isValidNumber(value)) return undefined;
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}°C`;
}

/** ISO timestamp → local `"HH:MM"`, or `""`. */
export function hhmm(value?: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const h = `${d.getHours()}`.padStart(2, "0");
  const m = `${d.getMinutes()}`.padStart(2, "0");
  return `${h}:${m}`;
}

/** `"HH:MM:SS"` / `"HH:MM:SS+00:00"` → `"HH:MM"`. */
export function clockTime(value?: string): string {
  if (!value) return "";
  const m = value.match(/^(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : "";
}

/** Duration between two ISO timestamps as `"45m"`, or `undefined`. */
export function durationBetween(start?: string, end?: string): string | undefined {
  if (!start || !end) return undefined;
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (Number.isNaN(a) || Number.isNaN(b)) return undefined;
  return duration(Math.max(0, (b - a) / 1000));
}

/** snake_case / camelCase → `"Title Case"`. */
export function titleCase(text: string): string {
  return text
    .replace(/_/g, " ")
    .replace(/([A-Z])/g, " $1")
    .trim()
    .split(" ")
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Clean an Oura tag code (`tag_generic_meditation` → `"Meditation"`). */
export function tagName(code?: string): string {
  if (!code) return "Tag";
  return titleCase(code.replace(/^tag_(generic_)?/, "").replace(/_/g, " "));
}
