# Install

## Prerequisites

- OpenCode v1.17.8+ ([anomalyco/opencode](https://github.com/anomalyco/opencode))
- Node.js or Bun (for building)

## Quick install (from source)

```bash
git clone https://github.com/anibalardid/opencode-ollama-stats-plugin.git
cd ollama-cloud-usage
npm install
npm run build
opencode plugin -g "$(pwd)"
```

Restart OpenCode. You'll see an **Ollama Cloud** section in the sidebar.

## Cookie setup

The plugin needs your `__Secure-session` cookie from [ollama.com/settings](https://ollama.com/settings).

**Option A — env var (recommended):**

```bash
export OLLAMA_USAGE_COOKIE="your-cookie-value"
```

**Option B — config file:**

Create `~/.config/opencode/opencode-quota/ollama-cloud.json`:

```json
{
  "cookie": "your-cookie-value"
}
```

**Option C — legacy config file:**

Create `~/.config/ollama-usage/config.yaml`:

```yaml
cookie: "your-cookie-value"
```

### How to get the cookie

1. Open [ollama.com/settings](https://ollama.com/settings) in your browser
2. Open DevTools → Storage → Cookies
3. Copy the value of `__Secure-session`

## How to update

```bash
cd ollama-cloud-usage
git pull
npm install
npm run build
# Restart OpenCode
```

## Uninstall

```bash
opencode plugin -g "$(pwd)"
# Then delete the folder
rm -rf ollama-cloud-usage
```

## Requirements

- macOS / Linux
- An active Ollama Cloud account with a valid session cookie
