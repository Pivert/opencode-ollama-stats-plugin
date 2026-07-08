# Install

## Prerequisites

- OpenCode v1.17.8+ ([anomalyco/opencode](https://github.com/anomalyco/opencode))
- Node.js or Bun (for building)

## Quick install (from source)

```bash
git clone https://github.com/Pivert/opencode-ollama-stats-plugin.git
cd opencode-ollama-stats-plugin
npm install
npm run build
opencode plugin -g "$(pwd)"
```

> **Note:** The `opencode plugin -g` command detects this is a TUI plugin and registers it in `~/.config/opencode/tui.json` — not in `opencode.jsonc` (which is for server plugins). Putting a TUI plugin in `opencode.jsonc` will fail with *"Plugin export is not a function"*.

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

1. Open [ollama.com/settings](https://ollama.com/settings) in your browser and log in
2. Press `F12` (or `Ctrl+Shift+I` on Linux/Windows, `Cmd+Option+I` on macOS)
3. Click the **Application** tab at the top
4. In the left sidebar, expand **Storage** → **Cookies** → click `https://ollama.com`
5. Find the row named `__Secure-session`
6. Double-click the **Value** cell, copy the entire value (`Ctrl+A`, `Ctrl+C`)

The cookie value is a long opaque string — it should look something like a JWT or base64-encoded token. Do not share it with anyone.

## Auto-install via OpenCode Sisyphus

Copy the following block into a conversation with Sisyphus (or any OpenCode agent):

```text
Install the ollama-stats plugin:

1. Ensure OLLAMA_USAGE_COOKIE is set — check: `${#OLLAMA_USAGE_COOKIE}` (must be >= 50 chars). If not set, check if `~/.config/opencode/opencode-quota/ollama-cloud.json` exists. If neither has a valid cookie, STOP and tell the user to configure it first.
2. Clone the repo: `git clone https://github.com/Pivert/opencode-ollama-stats-plugin.git`
3. cd opencode-ollama-stats-plugin
4. npm install
5. npm run build
6. opencode plugin -g "$(pwd)"
7. Tell the user to restart OpenCode.
```

## How to update

```bash
cd opencode-ollama-stats-plugin
git pull
npm install
npm run build
# Restart OpenCode
```

## Uninstall

```bash
opencode plugin -g "$(pwd)"
# Then delete the folder
rm -rf opencode-ollama-stats-plugin
```

## Requirements

- macOS / Linux
- An active Ollama Cloud account with a valid session cookie
