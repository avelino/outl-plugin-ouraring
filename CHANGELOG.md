# Changelog

## [2.0.0] — Rewritten for outl

Complete rewrite: this is now an **outl** plugin (was a Roam Research extension).

### Changed

- **Runtime**: targets the outl plugin API 1.0 (`definePlugin`, `ctx.*`) instead
  of the Roam Alpha API. Ships as a single bundled `index.js`.
- **Data destination**: flat pages `pages/<prefix>-YYYY-MM-DD.md` (default
  `ouraring-YYYY-MM-DD`). The Roam version used `ouraring/YYYY-MM-DD`.
- **Page structure**: flattened to an anchor block plus one line per section
  (Sleep / Readiness / Activity / Heart rate / Workouts / Tags), written in one
  turn via `ctx.page.appendTree`. Re-syncs only rewrite a day when it changed.
- **Networking**: uses the host's native `ctx.net.fetch` against
  `api.ouraring.com` — no more Roam CORS proxy.

### Added

- **Keychain-backed token**: the Oura Personal Access Token is read via
  `ctx.secrets` from the OS keychain, never stored in the workspace. Set it with
  `outl plugin secret set run.avelino.ouraring token`.
- **Config surface**: `pagePrefix` and `daysToSync` via the plugin config schema
  (`outl plugin config`, or a client's plugin settings).

### Removed

- Roam-specific code: `roamAlphaAPI` wrappers, settings panel/React UI, topbar
  button DOM, CORS proxy, `roam-block-reconciler`, Vite build.
