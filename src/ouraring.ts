/**
 * Oura Cloud API v2 client and DTOs.
 *
 * Requests go through `ctx.net.fetch` — the outl host performs the HTTP call
 * natively (no CORS proxy, unlike the Roam original). The `network:api.ouraring.com`
 * permission gates it; a denied host comes back as `{ ok: false }`, never a throw.
 */

import type { PluginContext } from "./plugin-sdk";
import { dateFromTimestamp } from "./dates";
import { isValidNumber } from "./formatters";

const OURA_API_BASE = "https://api.ouraring.com/v2/usercollection";
/** Oura's single-day queries are flaky; batch up to a week per request. */
const MAX_DAYS_PER_REQUEST = 7;
const REQUEST_TIMEOUT_MS = 15_000;

export interface OuraSleepContributors {
  deep_sleep?: number;
  efficiency?: number;
  latency?: number;
  rem_sleep?: number;
  restfulness?: number;
  timing?: number;
  total_sleep?: number;
}

export interface OuraSleep {
  day: string;
  score?: number;
  efficiency?: number;
  total_sleep_duration?: number;
  time_in_bed?: number;
  average_hr?: number;
  lowest_hr?: number;
  bedtime_start?: string;
  bedtime_end?: string;
  awake_time?: number;
  deep_sleep_duration?: number;
  light_sleep_duration?: number;
  rem_sleep_duration?: number;
  restless_periods?: number;
  average_hrv?: number;
  latency?: number;
  contributors?: OuraSleepContributors;
  [key: string]: unknown;
}

export interface OuraReadiness {
  day: string;
  score?: number;
  temperature_deviation?: number;
  temperature_trend_deviation?: number;
  [key: string]: unknown;
}

export interface OuraActivity {
  day: string;
  score?: number;
  steps?: number;
  equivalent_walking_distance?: number;
  active_calories?: number;
  total_calories?: number;
  [key: string]: unknown;
}

export interface OuraHeartRateSample {
  bpm?: number;
  timestamp?: string;
  [key: string]: unknown;
}

export interface OuraWorkout {
  day?: string;
  activity?: string;
  sport?: string;
  label?: string;
  start_datetime?: string;
  end_datetime?: string;
  calories?: number;
  distance?: number;
  intensity?: string;
  [key: string]: unknown;
}

export interface OuraTag {
  day?: string;
  start_day?: string;
  start_time?: string;
  tag_type_code?: string;
  custom_name?: string;
  comment?: string;
  timestamp?: string;
  tags?: string[];
  [key: string]: unknown;
}

export interface DailyOuraData {
  date: string;
  sleep: OuraSleep[];
  readiness: OuraReadiness[];
  activity: OuraActivity[];
  heartrate: OuraHeartRateSample[];
  workouts: OuraWorkout[];
  tags: OuraTag[];
}

interface CollectionResponse<T> {
  data?: T[];
  next_token?: string;
}

/** Encode a params object as a query string (Boa has no URLSearchParams). */
function encodeQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join("&");
}

/** Fetch one paginated Oura collection, following `next_token` to the end. */
async function fetchCollection<T>(
  ctx: PluginContext,
  path: string,
  params: Record<string, string>,
  token: string
): Promise<T[]> {
  const items: T[] = [];
  let nextToken: string | undefined;
  do {
    const query: Record<string, string> = { ...params };
    if (nextToken) query.next_token = nextToken;
    const url = `${OURA_API_BASE}${path}?${encodeQuery(query)}`;

    const r = await ctx.net.fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      timeoutMs: REQUEST_TIMEOUT_MS,
    });
    if (!r.ok) {
      throw new Error(`Oura ${path} request failed (HTTP ${r.status})`);
    }
    const json = (await r.json<CollectionResponse<T>>()) ?? {};
    const data = Array.isArray(json.data) ? json.data : [];
    items.push(...data);
    nextToken = json.next_token;
  } while (nextToken);
  return items;
}

/** Split dates (sorted) into contiguous chunks of at most 7. */
function chunkDates(dates: string[]): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < dates.length; i += MAX_DAYS_PER_REQUEST) {
    chunks.push(dates.slice(i, i + MAX_DAYS_PER_REQUEST));
  }
  return chunks;
}

function emptyDay(date: string): DailyOuraData {
  return { date, sleep: [], readiness: [], activity: [], heartrate: [], workouts: [], tags: [] };
}

/**
 * Fetch every data type for `dates` (batched ≤7 days/request, 6 endpoints in
 * parallel) and group the results by day. `dates` may be in any order; the
 * returned map is keyed by ISO date.
 */
export async function fetchAllDailyData(
  ctx: PluginContext,
  token: string,
  dates: string[]
): Promise<Map<string, DailyOuraData>> {
  const result = new Map<string, DailyOuraData>();
  if (dates.length === 0) return result;
  for (const d of dates) result.set(d, emptyDay(d));

  const sorted = [...dates].sort();
  for (const chunk of chunkDates(sorted)) {
    const start = chunk[0];
    const end = chunk[chunk.length - 1];
    const range = { start_date: start, end_date: end };

    const [sleep, readiness, activity, workouts, heartrate, tags] = await Promise.all([
      fetchCollection<OuraSleep>(ctx, "/daily_sleep", range, token),
      fetchCollection<OuraReadiness>(ctx, "/daily_readiness", range, token),
      fetchCollection<OuraActivity>(ctx, "/daily_activity", range, token),
      fetchCollection<OuraWorkout>(ctx, "/workout", range, token),
      fetchCollection<OuraHeartRateSample>(
        ctx,
        "/heartrate",
        { start_datetime: `${start}T00:00:00Z`, end_datetime: `${end}T23:59:59Z` },
        token
      ),
      // `/tag` is deprecated — use `/enhanced_tag` only.
      fetchCollection<OuraTag>(ctx, "/enhanced_tag", range, token),
    ]);

    group(sleep, result, (x) => x.day, (d) => d.sleep);
    group(readiness, result, (x) => x.day, (d) => d.readiness);
    group(activity, result, (x) => x.day, (d) => d.activity);
    group(workouts, result, (x) => x.day ?? dateFromTimestamp(x.start_datetime), (d) => d.workouts);
    group(heartrate, result, (x) => dateFromTimestamp(x.timestamp), (d) => d.heartrate);
    group(tags, result, (x) => x.start_day ?? x.day ?? dateFromTimestamp(x.timestamp), (d) => d.tags);
  }
  return result;
}

function group<T>(
  items: T[],
  into: Map<string, DailyOuraData>,
  getDate: (item: T) => string | undefined,
  pick: (day: DailyOuraData) => T[]
): void {
  for (const item of items) {
    const day = getDate(item);
    if (!day) continue;
    const bucket = into.get(day);
    if (bucket) pick(bucket).push(item);
  }
}

/** min / max / average bpm across heart-rate samples. */
export function summarizeHeartRate(samples: OuraHeartRateSample[]): {
  min?: number;
  max?: number;
  average?: number;
} {
  const values = samples.map((s) => s.bpm).filter(isValidNumber);
  if (values.length === 0) return {};
  const min = Math.min(...values);
  const max = Math.max(...values);
  const average = Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
  return { min, max, average };
}
