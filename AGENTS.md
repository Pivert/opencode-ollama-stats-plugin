# opencode-ollama-stats-plugin

**Generated:** 2026-07-08
**Stack:** Solid.js + JSX → tsup → ESM, OpenCode TUI plugin

## STRUCTURE

```
./
├── index.tsx          # Single source file (478 lines)
├── dist/              # Built output (loaded by OpenCode)
├── tsup.config.ts     # ESM build, external deps
├── tsconfig.json      # ES2022, @opentui/solid JSX
├── AGENTS.md          # Project knowledge base
├── INSTALL.md         # Install + cookie + Sisyphus auto-install docs
├── README.md          # Usage overview
└── .opencode/         # Local plugin config (gitignored)
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Plugin entry + TUI rendering | `index.tsx` (default export `{ id, tui }`) |
| Cookie resolution | `resolveCookie()` in `index.tsx` |
| Ollama settings scraping | `scrapeUsage()` + `parseUsageFromHtml()` |
| Per-model parser | `parseModels()` + `data-usage-segment` regex in `index.tsx` |
| Shared cache | `readCache()` / `writeCache()` in `index.tsx` — file at `~/.config/opencode/opencode-quota/ollama-cloud-cache.json` |
| Sidebar UI (Solid JSX) | `sidebar_content` slot in `index.tsx` |
| Build config | `tsup.config.ts` |

## CONVENTIONS

- **Single-file plugin** — no splitting unless >500 lines
- **ESM only** — `"type": "module"`, `tsup` outputs ESM
- **External deps** — `@opencode-ai/plugin`, `@opentui/core`, `@opentui/solid`, `solid-js` are peer deps, never bundled
- **Cookie sources** checked in order: env var → JSON config → YAML config
- **Shared cache** — all OpenCode sessions share a JSON cache file; re-fetches from ollama.com only when cache >60s old
- **Refresh** every 60s + on `session.updated` event
- **Retry** on scrape failure: 5s → 15s → 30s, then stop
- **State** managed via Solid signals: `loading | error | help | data`
- **KV** used for expand/collapse persistence (3 keys: main, session-models, weekly-models)
- **Models parsed** from HTML `<button data-usage-segment>` elements; bar widths are scaled to the session/weekly total so model percents sum to the actual usage
- **UI layout** — Session and Weekly are individually expandable; models sorted descending by percent; "Reset" lines use muted text color

## COMMANDS

```bash
npm run build    # tsup → dist/index.js
npm run dev      # tsup --watch
```

## NOTES

- Plugin registers as TUI plugin (not server) — goes in `~/.config/opencode/tui.json`, NOT in `opencode.jsonc`
- Requires `OLLAMA_USAGE_COOKIE` env var or config file with `__Secure-session` cookie from ollama.com/settings
- No tests, no CI, no linter config
- Forked from `anibalardid/opencode-ollama-stats-plugin` → `Pivert/opencode-ollama-stats-plugin`