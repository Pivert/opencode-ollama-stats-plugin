# opencode-ollama-stats-plugin

**Generated:** 2026-07-08
**Stack:** Solid.js + JSX → tsup → ESM, OpenCode TUI plugin

## STRUCTURE

```
./
├── index.tsx          # Single source file (347 lines)
├── dist/              # Built output (loaded by OpenCode)
├── tsup.config.ts     # ESM build, external deps
├── tsconfig.json      # ES2022, @opentui/solid JSX
└── .opencode/         # Local plugin config (gitignored)
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Plugin entry + TUI rendering | `index.tsx` (default export `{ id, tui }`) |
| Cookie resolution | `resolveCookie()` in `index.tsx` |
| Ollama settings scraping | `scrapeUsage()` + `parseUsageFromHtml()` |
| Sidebar UI (Solid JSX) | `sidebar_content` slot in `index.tsx` |
| Build config | `tsup.config.ts` |

## CONVENTIONS

- **Single-file plugin** — no splitting unless >500 lines
- **ESM only** — `"type": "module"`, `tsup` outputs ESM
- **External deps** — `@opencode-ai/plugin`, `@opentui/core`, `@opentui/solid`, `solid-js` are peer deps, never bundled
- **Cookie sources** checked in order: env var → JSON config → YAML config
- **Refresh** every 60s + on `session.updated` event
- **Retry** on scrape failure: 5s → 15s → 30s, then stop
- **State** managed via Solid signals: `loading | error | help | data`
- **KV** used for expand/collapse persistence

## COMMANDS

```bash
npm run build    # tsup → dist/index.js
npm run dev      # tsup --watch
```

## NOTES

- Plugin registers as TUI plugin (not server) — goes in `~/.config/opencode/tui.json`
- Requires `OLLAMA_USAGE_COOKIE` env var or config file with `__Secure-session` cookie from ollama.com/settings
- No tests, no CI, no linter config
