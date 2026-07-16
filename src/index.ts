/**
 * Oura Ring — outl plugin.
 *
 * A single `oura-sync` command (slash menu + toolbar button) that fetches
 * recent Oura Ring data and writes it to flat daily pages
 * `<prefix>-YYYY-MM-DD` (i.e. `pages/ouraring-2025-11-29.md`).
 *
 * - `network:api.ouraring.com` — the Oura Cloud API v2 (native host fetch).
 * - `secrets` — the Personal Access Token, read from the OS keychain.
 * - `read-page` / `write-page` / `submit-op` — read the day's page and write it.
 *
 * The token is never stored in the workspace. Set it once with:
 *   outl plugin secret set run.avelino.ouraring token
 */

import { definePlugin, type PluginContext } from "./plugin-sdk";
import { buildDateRange, isIsoDate } from "./dates";
import { fetchAllDailyData } from "./ouraring";
import { writeDailyOuraPage, type DaySyncResult } from "./blocks";

interface OuraConfig {
  pagePrefix?: string;
  daysToSync?: number;
}

const DEFAULT_PAGE_PREFIX = "ouraring";
const DEFAULT_DAYS = 7;
const PLUGIN_ID = "run.avelino.ouraring";

export default definePlugin({
  activate(ctx: PluginContext) {
    ctx.commands.register("oura-sync", async () => {
      const token = await ctx.secrets.get("token");
      if (!token) {
        ctx.ui.notify(`No Oura token. Run: outl plugin secret set ${PLUGIN_ID} token`);
        return;
      }

      const cfg = ctx.config.get<OuraConfig>() ?? {};
      const prefix = cfg.pagePrefix?.trim() || DEFAULT_PAGE_PREFIX;
      const days = Math.max(1, Math.floor(cfg.daysToSync ?? DEFAULT_DAYS));
      const dates = buildDateRange(days);

      ctx.ui.notify(`Syncing Oura data for ${days} day(s)…`);

      let data;
      try {
        data = await fetchAllDailyData(ctx, token, dates);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.log.error(`[ouraring] fetch failed: ${msg}`);
        ctx.ui.notify(`Oura sync failed: ${msg}`);
        return;
      }

      const tally: Record<DaySyncResult, number> = { created: 0, updated: 0, unchanged: 0 };
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
        `Oura sync done — ${tally.created} created, ${tally.updated} updated, ${tally.unchanged} unchanged.`
      );
    });
  },
});
