# Ollama Cloud Usage

OpenCode sidebar plugin that shows your **Ollama Cloud** session and weekly usage — scraped from [ollama.com/settings](https://ollama.com/settings).

```
Ollama Cloud (pro)
Session    45.3% used
████░░░░ 54.7% free
Reset in 7h
Weekly    69.5% used
██░░░░░░ 30.5% free
Reset in 3d
```

## Install

See [INSTALL.md](./INSTALL.md) for setup and cookie configuration instructions.

> [Leer en español](./README.es.md) · [Instalación en español](./INSTALL.es.md)

## How it works

The plugin fetches your Ollama Cloud settings page using a `__Secure-session` cookie and parses the HTML for:

- **Session usage** — percentage used in the current session window
- **Weekly usage** — percentage used in the current weekly window
- **Reset times** — when each window resets (shown as relative time)
- **Plan tier** — your plan (Pro, etc.)

It refreshes every 60 seconds and also on session activity events.

### If no cookie is configured

The sidebar shows a help message with the exact paths and instructions to set it up:

```
⚠ Ollama Cloud
No cookie configured
Set OLLAMA_USAGE_COOKIE
or create:
~/.config/opencode/
  opencode-quota/
    ollama-cloud.json
  → {"cookie":"..."}
```

## Cookie sources (checked in order)

| Source | Location |
|--------|----------|
| Env var | `OLLAMA_USAGE_COOKIE` |
| JSON config | `~/.config/opencode/opencode-quota/ollama-cloud.json` |
| YAML config | `~/.config/ollama-usage/config.yaml` |
| Legacy YAML | `~/.ollama-usage/config.yaml` |

## Files

| File | Purpose |
|------|---------|
| `index.tsx` | Plugin source (JSX + Solid.js) |
| `package.json` | npm package manifest |
| `tsup.config.ts` | Build config |
| `tsconfig.json` | TypeScript config |
| `dist/` | Built output (loaded by OpenCode) |

## License

MIT
