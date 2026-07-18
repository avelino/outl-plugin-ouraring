# Oura Ring plugin (outl) — Agent Guidelines

## Snapshot

An [outl](https://github.com/avelino/outl) plugin in strict TypeScript, bundled
with esbuild into a single `index.js`. Syncs Oura Ring data into flat daily
pages `pages/<prefix>-YYYY-MM-DD.md`.

- **Manifest:** `plugin.json` — id `run.avelino.ouraring`, API `^1.0`.
- **Entry:** `src/index.ts` → `definePlugin({ activate })`, registers the
  `oura-sync` command (slash + toolbar).
- **Config:** `config.schema.json` — `pagePrefix`, `daysToSync`, and `token`
  (marked `x-outl-secret`, so it lives in the OS keychain via `ctx.secrets`).
- **SDK:** `@outl/plugin-sdk` (npm dependency, `^1.0.0`) — types-only contract
  plus `definePlugin`. Source: `avelino/outl:plugin-sdk`.

## Modules

| File | Responsibility |
|------|----------------|
| `index.ts` | Entry, `oura-sync` command, orchestration (config + secret → fetch → write). |
| `ouraring.ts` | Oura API v2 DTOs, `ctx.net` client, batch fetch (≤7 days), grouping. |
| `blocks.ts` | Flattened day structure + idempotent page reconciliation. |
| `formatters.ts` | Pure formatting helpers (durations, distance, temp, etc.). |
| `dates.ts` | ISO date range and timestamp helpers. |

## The runtime model that shapes everything: describe → apply

- Reads (`ctx.blocks.query`, `ctx.config.get`, `ctx.secrets.get`) are a snapshot
  from the start of the turn; writes are buffered and applied after the handler
  returns. **A block you create is not visible to a later query in the same turn.**
- A plugin **cannot** create a page's first block with `ctx.blocks.create`
  (no parent id to hand it mid-turn). Seed fresh content with
  **`ctx.page.appendTree(slug, tree)`** — the host threads child ids internally
  and writes the whole nested tree in one turn.
- `ctx.blocks.query` results carry `parent` (id or `null`) — use it to tell the
  anchor block from its children when reconciling.

## Idempotent write strategy (`blocks.ts`)

1. `query({ page: slug })` → find the anchor (`parent == null`, text starts with
   `#ouraring `).
2. No anchor → `ctx.page.appendTree(slug, [anchor+children])` (creates the page too).
3. Anchor exists → compare current vs desired lines (as a set). Unchanged → skip.
   Changed → delete children then anchor, and `appendTree` the fresh day.

Pages are **flat**: `pages/<slug>.md`, slug is filename-safe (no `/`). Do not use
`/` in a page name — outl's slug rejects it (and the file walker is not recursive).

## Secrets

- The token is **never** in the workspace. Read it with `ctx.secrets.get("token")`;
  it returns `null` until the user runs
  `outl plugin secret set run.avelino.ouraring token`. Guard for `null` and tell
  the user how to set it.

## Boa engine caveats

The plugin runs in Boa (pure-Rust JS). Plain ECMAScript only — **no** DOM/Web
APIs: no `URLSearchParams` (build query strings by hand), no `fetch` (use
`ctx.net.fetch`). `Date`, `encodeURIComponent`, `Promise`, `JSON` are available.

## Commands

```sh
bun install
bun run typecheck   # tsc --noEmit
bun run build       # esbuild → index.js
```

## Checklist before done

- [ ] `bun run typecheck` passes.
- [ ] `bun run build` produces `index.js`.
- [ ] Smoke-tested via `outl plugin install . --yes` + `outl plugin run … oura-sync`.
- [ ] CHANGELOG updated.
- [ ] `@outl/plugin-sdk` pinned to a published version if you touched APIs.
