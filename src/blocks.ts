/**
 * Builds a day's Oura summary and writes it to its page, idempotently.
 *
 * Structure is deliberately **flat** — one anchor block plus one line per
 * section — because the outl plugin runtime is describe→apply: a plugin can't
 * read back ids for blocks it creates in the same turn. `ctx.page.appendTree`
 * seeds a whole day in one shot; re-syncs compare content and only rewrite the
 * day when it actually changed (no op-log churn on a no-op sync).
 *
 *   ouraring-2025-11-29                                  ← page (pages/ouraring-2025-11-29.md)
 *     #ouraring [[2025-11-29]] · sleep 85 · readiness 78 ← anchor
 *       Sleep — Score 85 · 22:30–06:45 · 7h 32m · …
 *       Readiness — Score 78 · Temp +0.15°C
 *       Activity — Score 90 · 8543 steps · 5.20 km
 *       Heart rate — 62 avg / 48 min / 145 max
 *       Workout — 07:30 Running · 45m · 320 kcal · 5.20 km
 *       Tag — 22:00 [[No Caffeine]]
 */

import type { Block, PluginContext, TreeNode } from "@outl/plugin-sdk";
import {
  clockTime,
  duration,
  durationBetween,
  hhmm,
  isValidNumber,
  km,
  num,
  pct,
  tagName,
  tempDeviation,
  titleCase,
} from "./formatters";
import type {
  DailyOuraData,
  OuraActivity,
  OuraReadiness,
  OuraSleep,
  OuraTag,
  OuraWorkout,
} from "./ouraring";
import { summarizeHeartRate } from "./ouraring";

/** Every anchor block starts with this tag, used to spot it on re-sync. */
const ANCHOR_MARKER = "#ouraring";

/** Outcome of syncing one day, for the run summary. */
export type DaySyncResult = "created" | "updated" | "unchanged";

/** Join the truthy parts with ` · `. */
function join(parts: (string | undefined)[]): string {
  return parts.filter((p): p is string => !!p).join(" · ");
}

/** `label value` when value is set, else `undefined` (dropped by `join`). */
function label(name: string, value?: string): string | undefined {
  return value ? `${name} ${value}` : undefined;
}

function sleepLine(sessions: OuraSleep[]): string | undefined {
  if (sessions.length === 0) return undefined;
  const s = sessions[0];
  const bedtime = s.bedtime_start || s.bedtime_end ? `${hhmm(s.bedtime_start)}–${hhmm(s.bedtime_end)}` : undefined;
  const hr =
    isValidNumber(s.average_hr) || isValidNumber(s.lowest_hr)
      ? `HR ${join([num(s.average_hr), s.lowest_hr != null ? `${s.lowest_hr}` : undefined]).replace(" · ", "/")}`
      : undefined;
  const parts = [
    label("Score", num(s.score)),
    bedtime,
    duration(s.total_sleep_duration),
    label("Deep", duration(s.deep_sleep_duration)),
    label("REM", duration(s.rem_sleep_duration)),
    label("Light", duration(s.light_sleep_duration)),
    label("Awake", duration(s.awake_time)),
    label("Eff", pct(s.efficiency)),
    label("Lat", duration(s.latency)),
    label("Restless", num(s.restless_periods)),
    hr,
    label("HRV", num(s.average_hrv, "ms")),
  ];
  const body = join(parts);
  return body ? `Sleep — ${body}` : undefined;
}

function readinessLine(entries: OuraReadiness[]): string | undefined {
  if (entries.length === 0) return undefined;
  const r = entries[0];
  const body = join([
    label("Score", num(r.score)),
    label("Temp", tempDeviation(r.temperature_deviation)),
    label("trend", tempDeviation(r.temperature_trend_deviation)),
  ]);
  return body ? `Readiness — ${body}` : undefined;
}

function activityLine(entries: OuraActivity[]): string | undefined {
  if (entries.length === 0) return undefined;
  const a = entries[0];
  const body = join([
    label("Score", num(a.score)),
    a.steps != null ? `${a.steps} steps` : undefined,
    km(a.equivalent_walking_distance),
    label("Active", num(a.active_calories, "kcal")),
    label("Total", num(a.total_calories, "kcal")),
  ]);
  return body ? `Activity — ${body}` : undefined;
}

function heartRateLine(samples: DailyOuraData["heartrate"]): string | undefined {
  const s = summarizeHeartRate(samples);
  if (s.average == null && s.min == null && s.max == null) return undefined;
  const parts = join([
    s.average != null ? `${s.average} avg` : undefined,
    s.min != null ? `${s.min} min` : undefined,
    s.max != null ? `${s.max} max` : undefined,
  ]).replace(/ · /g, " / ");
  return `Heart rate — ${parts}`;
}

function workoutLine(w: OuraWorkout): string {
  const activity = titleCase(w.activity ?? w.sport ?? w.label ?? "Workout");
  const time = hhmm(w.start_datetime);
  const head = time ? `${time} ${activity}` : activity;
  const body = join([
    durationBetween(w.start_datetime, w.end_datetime),
    w.calories != null ? `${w.calories} kcal` : undefined,
    km(w.distance),
    w.intensity,
  ]);
  return body ? `Workout — ${head} · ${body}` : `Workout — ${head}`;
}

function tagLine(t: OuraTag): string {
  const time = clockTime(t.start_time) || hhmm(t.timestamp);
  let display: string;
  if (t.custom_name) display = `[[${tagName(t.custom_name)}]]`;
  else if (t.tags && t.tags.length > 0) display = t.tags.map((x) => `[[${tagName(x)}]]`).join(" ");
  else if (t.tag_type_code && t.tag_type_code !== "custom") display = `[[${tagName(t.tag_type_code)}]]`;
  else display = "[[Tag]]";
  const comment = t.comment ? ` – ${t.comment}` : "";
  return `Tag — ${time ? `${time} ` : ""}${display}${comment}`;
}

/** The anchor header line, carrying the date link and the headline scores. */
function anchorHeader(data: DailyOuraData): string {
  const sleep = data.sleep[0]?.score;
  const readiness = data.readiness[0]?.score;
  const scores = join([
    sleep != null ? `sleep ${sleep}` : undefined,
    readiness != null ? `readiness ${readiness}` : undefined,
  ]);
  return scores
    ? `${ANCHOR_MARKER} [[${data.date}]] · ${scores}`
    : `${ANCHOR_MARKER} [[${data.date}]]`;
}

/** The header + the ordered section lines for a day (empty sections dropped). */
function buildDay(data: DailyOuraData): { header: string; lines: string[] } {
  const lines: string[] = [];
  const push = (line?: string) => {
    if (line) lines.push(line);
  };
  push(sleepLine(data.sleep));
  push(readinessLine(data.readiness));
  push(activityLine(data.activity));
  push(heartRateLine(data.heartrate));
  for (const w of data.workouts) push(workoutLine(w));
  for (const t of data.tags) push(tagLine(t));
  return { header: anchorHeader(data), lines };
}

/** The day as a single-rooted forest for `ctx.page.appendTree`. */
function dayTree(header: string, lines: string[]): TreeNode[] {
  return [{ text: header, children: lines.map((text) => ({ text })) }];
}

function sameContent(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const x = [...a].sort();
  const y = [...b].sort();
  return x.every((v, i) => v === y[i]);
}

/**
 * Write (or refresh) one day's page. Idempotent:
 * - page/anchor missing → create the whole tree in one turn;
 * - present but changed → delete the old Oura blocks and re-create;
 * - unchanged → do nothing.
 *
 * `slug` is a flat page slug (`ouraring-2025-11-29`) — outl pages live at
 * `pages/<slug>.md`, and the slug is also the page title, so we read the day
 * back on the next sync with a plain `query({ page: slug })`.
 */
export async function writeDailyOuraPage(
  ctx: PluginContext,
  slug: string,
  data: DailyOuraData
): Promise<DaySyncResult> {
  const { header, lines } = buildDay(data);
  const tree = dayTree(header, lines);

  // A missing page reads back as no blocks; appendTree creates it (and the
  // whole day) in one turn.
  const blocks = await ctx.blocks.query({ page: slug });
  const anchor = blocks.find((b: Block) => b.parent == null && b.text.startsWith(`${ANCHOR_MARKER} `));
  if (!anchor) {
    await ctx.page.appendTree(slug, tree);
    return "created";
  }

  const children = blocks.filter((b: Block) => b.parent === anchor.id);
  const current = [anchor.text, ...children.map((b) => b.text)];
  const desired = [header, ...lines];
  if (sameContent(current, desired)) {
    return "unchanged";
  }

  // Replace the day: delete children (leaves) first, then the anchor, then
  // re-seed the fresh tree. All buffered this turn and applied in order.
  for (const c of children) await ctx.blocks.delete(c.id);
  await ctx.blocks.delete(anchor.id);
  await ctx.page.appendTree(slug, tree);
  return "updated";
}
