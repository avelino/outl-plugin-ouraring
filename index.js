"use strict";
(() => {
  // node_modules/@outl/plugin-sdk/src/index.ts
  function definePlugin(def) {
    if (def === null || typeof def !== "object") {
      throw new TypeError("definePlugin: expected a plugin definition object");
    }
    if (typeof def.activate !== "function") {
      throw new TypeError("definePlugin: `activate` must be a function");
    }
    if (def.deactivate !== void 0 && typeof def.deactivate !== "function") {
      throw new TypeError(
        "definePlugin: `deactivate` must be a function when provided"
      );
    }
    const host = globalThis;
    host.__outl_register?.(def);
    return def;
  }

  // src/dates.ts
  function isoDate(date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  function buildDateRange(days) {
    const out = [];
    const today = /* @__PURE__ */ new Date();
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      out.push(isoDate(d));
    }
    return out;
  }
  function dateFromTimestamp(ts) {
    if (!ts) return void 0;
    const m = ts.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : void 0;
  }
  function isIsoDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  // src/formatters.ts
  function isValidNumber(value) {
    return typeof value === "number" && !Number.isNaN(value);
  }
  function num(value, suffix) {
    if (!isValidNumber(value)) return void 0;
    return suffix ? `${value} ${suffix}` : `${value}`;
  }
  function pct(value) {
    if (!isValidNumber(value)) return void 0;
    return `${value}%`;
  }
  function duration(seconds) {
    if (!isValidNumber(seconds)) return void 0;
    const total = Math.round(seconds / 60);
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
    return `${m}m`;
  }
  function km(meters) {
    if (!isValidNumber(meters)) return void 0;
    return `${(meters / 1e3).toFixed(2)} km`;
  }
  function tempDeviation(value) {
    if (!isValidNumber(value)) return void 0;
    const sign = value >= 0 ? "+" : "";
    return `${sign}${value.toFixed(2)}\xB0C`;
  }
  function hhmm(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const h = `${d.getHours()}`.padStart(2, "0");
    const m = `${d.getMinutes()}`.padStart(2, "0");
    return `${h}:${m}`;
  }
  function clockTime(value) {
    if (!value) return "";
    const m = value.match(/^(\d{2}):(\d{2})/);
    return m ? `${m[1]}:${m[2]}` : "";
  }
  function durationBetween(start, end) {
    if (!start || !end) return void 0;
    const a = Date.parse(start);
    const b = Date.parse(end);
    if (Number.isNaN(a) || Number.isNaN(b)) return void 0;
    return duration(Math.max(0, (b - a) / 1e3));
  }
  function titleCase(text) {
    return text.replace(/_/g, " ").replace(/([A-Z])/g, " $1").trim().split(" ").filter((w) => w.length > 0).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  }
  function tagName(code) {
    if (!code) return "Tag";
    return titleCase(code.replace(/^tag_(generic_)?/, "").replace(/_/g, " "));
  }

  // src/ouraring.ts
  var OURA_API_BASE = "https://api.ouraring.com/v2/usercollection";
  var MAX_DAYS_PER_REQUEST = 7;
  var REQUEST_TIMEOUT_MS = 15e3;
  function encodeQuery(params) {
    return Object.keys(params).map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join("&");
  }
  async function fetchCollection(ctx, path, params, token) {
    const items = [];
    let nextToken;
    do {
      const query = { ...params };
      if (nextToken) query.next_token = nextToken;
      const url = `${OURA_API_BASE}${path}?${encodeQuery(query)}`;
      const r = await ctx.net.fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        timeoutMs: REQUEST_TIMEOUT_MS
      });
      if (!r.ok) {
        throw new Error(`Oura ${path} request failed (HTTP ${r.status})`);
      }
      const json = await r.json() ?? {};
      const data = Array.isArray(json.data) ? json.data : [];
      items.push(...data);
      nextToken = json.next_token;
    } while (nextToken);
    return items;
  }
  function chunkDates(dates) {
    const chunks = [];
    for (let i = 0; i < dates.length; i += MAX_DAYS_PER_REQUEST) {
      chunks.push(dates.slice(i, i + MAX_DAYS_PER_REQUEST));
    }
    return chunks;
  }
  function emptyDay(date) {
    return { date, sleep: [], readiness: [], activity: [], heartrate: [], workouts: [], tags: [] };
  }
  async function fetchAllDailyData(ctx, token, dates) {
    const result = /* @__PURE__ */ new Map();
    if (dates.length === 0) return result;
    for (const d of dates) result.set(d, emptyDay(d));
    const sorted = [...dates].sort();
    for (const chunk of chunkDates(sorted)) {
      const start = chunk[0];
      const end = chunk[chunk.length - 1];
      const range = { start_date: start, end_date: end };
      const [sleep, readiness, activity, workouts, heartrate, tags] = await Promise.all([
        fetchCollection(ctx, "/daily_sleep", range, token),
        fetchCollection(ctx, "/daily_readiness", range, token),
        fetchCollection(ctx, "/daily_activity", range, token),
        fetchCollection(ctx, "/workout", range, token),
        fetchCollection(
          ctx,
          "/heartrate",
          { start_datetime: `${start}T00:00:00Z`, end_datetime: `${end}T23:59:59Z` },
          token
        ),
        // `/tag` is deprecated — use `/enhanced_tag` only.
        fetchCollection(ctx, "/enhanced_tag", range, token)
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
  function group(items, into, getDate, pick) {
    for (const item of items) {
      const day = getDate(item);
      if (!day) continue;
      const bucket = into.get(day);
      if (bucket) pick(bucket).push(item);
    }
  }
  function summarizeHeartRate(samples) {
    const values = samples.map((s) => s.bpm).filter(isValidNumber);
    if (values.length === 0) return {};
    const min = Math.min(...values);
    const max = Math.max(...values);
    const average = Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
    return { min, max, average };
  }

  // src/blocks.ts
  var ANCHOR_MARKER = "#ouraring";
  function join(parts) {
    return parts.filter((p) => !!p).join(" \xB7 ");
  }
  function label(name, value) {
    return value ? `${name} ${value}` : void 0;
  }
  function sleepLine(sessions) {
    if (sessions.length === 0) return void 0;
    const s = sessions[0];
    const bedtime = s.bedtime_start || s.bedtime_end ? `${hhmm(s.bedtime_start)}\u2013${hhmm(s.bedtime_end)}` : void 0;
    const hr = isValidNumber(s.average_hr) || isValidNumber(s.lowest_hr) ? `HR ${join([num(s.average_hr), s.lowest_hr != null ? `${s.lowest_hr}` : void 0]).replace(" \xB7 ", "/")}` : void 0;
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
      label("HRV", num(s.average_hrv, "ms"))
    ];
    const body = join(parts);
    return body ? `Sleep \u2014 ${body}` : void 0;
  }
  function readinessLine(entries) {
    if (entries.length === 0) return void 0;
    const r = entries[0];
    const body = join([
      label("Score", num(r.score)),
      label("Temp", tempDeviation(r.temperature_deviation)),
      label("trend", tempDeviation(r.temperature_trend_deviation))
    ]);
    return body ? `Readiness \u2014 ${body}` : void 0;
  }
  function activityLine(entries) {
    if (entries.length === 0) return void 0;
    const a = entries[0];
    const body = join([
      label("Score", num(a.score)),
      a.steps != null ? `${a.steps} steps` : void 0,
      km(a.equivalent_walking_distance),
      label("Active", num(a.active_calories, "kcal")),
      label("Total", num(a.total_calories, "kcal"))
    ]);
    return body ? `Activity \u2014 ${body}` : void 0;
  }
  function heartRateLine(samples) {
    const s = summarizeHeartRate(samples);
    if (s.average == null && s.min == null && s.max == null) return void 0;
    const parts = join([
      s.average != null ? `${s.average} avg` : void 0,
      s.min != null ? `${s.min} min` : void 0,
      s.max != null ? `${s.max} max` : void 0
    ]).replace(/ · /g, " / ");
    return `Heart rate \u2014 ${parts}`;
  }
  function workoutLine(w) {
    const activity = titleCase(w.activity ?? w.sport ?? w.label ?? "Workout");
    const time = hhmm(w.start_datetime);
    const head = time ? `${time} ${activity}` : activity;
    const body = join([
      durationBetween(w.start_datetime, w.end_datetime),
      w.calories != null ? `${w.calories} kcal` : void 0,
      km(w.distance),
      w.intensity
    ]);
    return body ? `Workout \u2014 ${head} \xB7 ${body}` : `Workout \u2014 ${head}`;
  }
  function tagLine(t) {
    const time = clockTime(t.start_time) || hhmm(t.timestamp);
    let display;
    if (t.custom_name) display = `[[${tagName(t.custom_name)}]]`;
    else if (t.tags && t.tags.length > 0) display = t.tags.map((x) => `[[${tagName(x)}]]`).join(" ");
    else if (t.tag_type_code && t.tag_type_code !== "custom") display = `[[${tagName(t.tag_type_code)}]]`;
    else display = "[[Tag]]";
    const comment = t.comment ? ` \u2013 ${t.comment}` : "";
    return `Tag \u2014 ${time ? `${time} ` : ""}${display}${comment}`;
  }
  function anchorHeader(data) {
    const sleep = data.sleep[0]?.score;
    const readiness = data.readiness[0]?.score;
    const scores = join([
      sleep != null ? `sleep ${sleep}` : void 0,
      readiness != null ? `readiness ${readiness}` : void 0
    ]);
    return scores ? `${ANCHOR_MARKER} [[${data.date}]] \xB7 ${scores}` : `${ANCHOR_MARKER} [[${data.date}]]`;
  }
  function buildDay(data) {
    const lines = [];
    const push = (line) => {
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
  function dayTree(header, lines) {
    return [{ text: header, children: lines.map((text) => ({ text })) }];
  }
  function sameContent(a, b) {
    if (a.length !== b.length) return false;
    const x = [...a].sort();
    const y = [...b].sort();
    return x.every((v, i) => v === y[i]);
  }
  async function writeDailyOuraPage(ctx, slug, data) {
    const { header, lines } = buildDay(data);
    const tree = dayTree(header, lines);
    const blocks = await ctx.blocks.query({ page: slug });
    const anchor = blocks.find((b) => b.parent == null && b.text.startsWith(`${ANCHOR_MARKER} `));
    if (!anchor) {
      await ctx.page.appendTree(slug, tree);
      return "created";
    }
    const children = blocks.filter((b) => b.parent === anchor.id);
    const current = [anchor.text, ...children.map((b) => b.text)];
    const desired = [header, ...lines];
    if (sameContent(current, desired)) {
      return "unchanged";
    }
    for (const c of children) await ctx.blocks.delete(c.id);
    await ctx.blocks.delete(anchor.id);
    await ctx.page.appendTree(slug, tree);
    return "updated";
  }

  // src/index.ts
  var DEFAULT_PAGE_PREFIX = "ouraring";
  var DEFAULT_DAYS = 7;
  var PLUGIN_ID = "run.avelino.ouraring";
  var index_default = definePlugin({
    activate(ctx) {
      ctx.commands.register("oura-sync", async () => {
        const token = await ctx.secrets.get("token");
        if (!token) {
          ctx.ui.notify(`No Oura token. Run: outl plugin secret set ${PLUGIN_ID} token`);
          return;
        }
        const cfg = ctx.config.get() ?? {};
        const prefix = cfg.pagePrefix?.trim() || DEFAULT_PAGE_PREFIX;
        const days = Math.max(1, Math.floor(cfg.daysToSync ?? DEFAULT_DAYS));
        const dates = buildDateRange(days);
        ctx.ui.notify(`Syncing Oura data for ${days} day(s)\u2026`);
        let data;
        try {
          data = await fetchAllDailyData(ctx, token, dates);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          ctx.log.error(`[ouraring] fetch failed: ${msg}`);
          ctx.ui.notify(`Oura sync failed: ${msg}`);
          return;
        }
        const tally = { created: 0, updated: 0, unchanged: 0 };
        for (const date of dates) {
          if (!isIsoDate(date)) continue;
          const day = data.get(date);
          if (!day) continue;
          const slug = `${prefix}-${date}`;
          try {
            const result = await writeDailyOuraPage(ctx, slug, day);
            tally[result] += 1;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            ctx.log.error(`[ouraring] writing ${slug} failed: ${msg}`);
          }
        }
        ctx.ui.notify(
          `Oura sync done \u2014 ${tally.created} created, ${tally.updated} updated, ${tally.unchanged} unchanged.`
        );
      });
    }
  });
})();
//# sourceMappingURL=index.js.map
