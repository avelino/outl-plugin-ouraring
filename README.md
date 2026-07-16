# Oura Ring for outl

An [outl](https://github.com/avelino/outl) plugin that syncs your Oura Ring
health metrics into daily pages.

## Features

- **Sleep** — score, bedtime, duration, stages (deep/REM/light/awake), efficiency, HR, HRV.
- **Readiness** — score and temperature deviation/trend.
- **Activity** — score, steps, distance, calories.
- **Heart rate** — daily average, minimum, maximum bpm.
- **Workouts** — one line per workout (time, duration, calories, distance, intensity).
- **Tags** — Oura app tags with time and comment.

Each day is written to a flat page `pages/<prefix>-YYYY-MM-DD.md` (default prefix
`ouraring` → `pages/ouraring-2025-11-29.md`):

```md
- #ouraring [[2025-11-29]] · sleep 85 · readiness 78
  - Sleep — Score 85 · 22:30–06:45 · 7h 32m · Deep 1h 45m · REM 2h 10m · Eff 92% · HR 52/48 · HRV 45ms
  - Readiness — Score 78 · Temp +0.15°C
  - Activity — Score 90 · 8543 steps · 5.20 km · Active 320 kcal
  - Heart rate — 62 avg / 48 min / 145 max
  - Workout — 07:30 Running · 45m · 320 kcal · 5.20 km
  - Tag — 22:00 [[No Caffeine]]
```

The structure is intentionally **flat** (anchor + one line per section): the outl
plugin runtime is describe→apply, so a plugin can't read back ids for blocks it
creates in the same turn. The whole day is written in one shot with
`ctx.page.appendTree`, and re-syncs only rewrite a day when its content changed.

## Requirements

- outl `>= 0.8.0` (needs the `secrets`, `appendTree`, and `block.parent` plugin APIs).
- An Oura [Personal Access Token](https://cloud.ouraring.com/personal-access-tokens).

## Install

```sh
# From a local clone (after building — see Development)
outl plugin install . --yes

# Or from GitHub
outl plugin install github:avelino/outl-plugin-ouraring --yes
```

It requests: `read-page`, `write-page`, `submit-op`, `secrets`, and
`network:api.ouraring.com` (approved on install).

## Configure

The token lives in your **OS keychain**, never in the workspace:

```sh
outl plugin secret set run.avelino.ouraring token
# Value for run.avelino.ouraring/token: ••••••••
```

Optional config (stored in the lockfile):

```sh
outl plugin config show run.avelino.ouraring
outl plugin config set run.avelino.ouraring pagePrefix ouraring
outl plugin config set run.avelino.ouraring daysToSync 7
```

| Field | Default | Description |
|-------|---------|-------------|
| `token` | (keychain) | Oura Personal Access Token — **secret**, stored in the OS keychain. |
| `pagePrefix` | `ouraring` | Pages are written to `<prefix>-YYYY-MM-DD`. |
| `daysToSync` | `7` | How many past days to fetch, including today. |

On desktop, mobile, and the TUI you can also set these from the plugin's
settings surface (same fields, same keychain-backed token).

## Sync

Run the `oura-sync` command from the slash menu / command palette, tap the 💍
toolbar button, or headless:

```sh
outl plugin run run.avelino.ouraring oura-sync
```

## Development

```sh
bun install        # esbuild + typescript
bun run typecheck  # tsc --noEmit
bun run build      # → index.js (bundled, single file)
```

The plugin bundles to a single `index.js`. `src/plugin-sdk.ts` is a vendored copy
of `@outl/plugin-sdk` (not yet on npm) — keep it in sync with the outl repo.

## License

MIT
