/** @jsxImportSource @opentui/solid */
/** @jsxRuntime automatic */
import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import { createRoot, createSignal } from "solid-js"

// ── Config sources ──────────────────────────────────────────────────────────
const CONFIG_PATHS = [
  { path: process.env.HOME + "/.config/opencode/opencode-quota/ollama-cloud.json", type: "json" },
  { path: process.env.HOME + "/.config/ollama-usage/config.yaml", type: "yaml" },
  { path: process.env.HOME + "/.ollama-usage/config.yaml", type: "yaml" },
] as const

const SETTINGS_URL = "https://ollama.com/settings"
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Gecko/20100101 Firefox/148.0"
const SCRAPE_TIMEOUT_MS = 10_000
const REFRESH_INTERVAL_MS = 60_000

// ── Cookie resolution ───────────────────────────────────────────────────────
interface CookieResult {
  cookie: string
  source: string
}

function readYamlCookie(content: string): string | null {
  const stripped = content.replace(/#[^\n]*/g, "")
  const m = stripped.match(/(?:^|\n)\s*cookie\s*:\s*["']?\s*(.+?)\s*["']?\s*(?:\n|$)/)
  return m ? m[1].trim() : null
}

async function resolveCookie(): Promise<{ result?: CookieResult; error?: string }> {
  // 1. Env var
  const env = process.env.OLLAMA_USAGE_COOKIE?.trim()
  if (env) return { result: { cookie: env, source: "OLLAMA_USAGE_COOKIE" } }

  // 2. Config files
  for (const { path, type } of CONFIG_PATHS) {
    try {
      const fs = await import("fs/promises")
      const content = await fs.readFile(path, "utf-8")

      let cookie: string | null = null
      if (type === "json") {
        const parsed = JSON.parse(content)
        cookie = typeof parsed.cookie === "string" ? parsed.cookie.trim() : null
      } else {
        cookie = readYamlCookie(content)
      }

      if (cookie) return { result: { cookie, source: path } }
    } catch (err: any) {
      if (err?.code !== "ENOENT") {
        return { error: `Error reading ${path}: ${err.message}` }
      }
    }
  }

  return { error: "no cookie found" }
}

// ── Shared cache ─────────────────────────────────────────────────────────────
const CACHE_DIR = process.env.HOME + "/.config/opencode/opencode-quota"
const CACHE_FILE = CACHE_DIR + "/ollama-cloud-cache.json"
const CACHE_TTL_MS = 60_000

interface CacheEntry {
  cached_at: string
  data: UsageData
}

async function readCache(): Promise<UsageData | null> {
  try {
    const fs = await import("fs/promises")
    const content = await fs.readFile(CACHE_FILE, "utf-8")
    const entry: CacheEntry = JSON.parse(content)
    const age = Date.now() - new Date(entry.cached_at).getTime()
    if (age < CACHE_TTL_MS) return entry.data
    return null
  } catch {
    return null
  }
}

async function writeCache(data: UsageData): Promise<void> {
  try {
    const fs = await import("fs/promises")
    await fs.mkdir(CACHE_DIR, { recursive: true })
    const entry: CacheEntry = { cached_at: new Date().toISOString(), data }
    await fs.writeFile(CACHE_FILE, JSON.stringify(entry), "utf-8")
  } catch {
    // cache write failure is non-fatal
  }
}

// ── Scraper ──────────────────────────────────────────────────────────────────
interface UsageData {
  sessionPercent: number
  weeklyPercent: number
  sessionReset?: string
  weeklyReset?: string
  planTier?: string
  balance?: string
  autoReload?: boolean
  sessionModels?: { name: string; requests: number; percent: number }[]
  weeklyModels?: { name: string; requests: number; percent: number }[]
}

const RETRY_DELAYS = [5_000, 15_000, 30_000] as const

function parseUsageFromHtml(html: string): { data?: UsageData; error?: string } {
  const usageRe = /(\d+(?:\.\d+)?)%\s*used/gi
  const usageMatches = [...html.matchAll(usageRe)]

  if (usageMatches.length === 0) {
    return { error: "No usage data found on settings page" }
  }

  let sessionPct: number | undefined
  let weeklyPct: number | undefined

  for (const match of usageMatches) {
    const pct = parseFloat(match[1])
    if (isNaN(pct)) continue

    const pos = match.index!
    const context = html.slice(Math.max(0, pos - 500), pos).toLowerCase()

    if (context.includes("session")) {
      sessionPct = pct
    } else if (context.includes("weekly")) {
      weeklyPct = pct
    }
  }

  // Fallback to positional if context matching failed
  if (sessionPct === undefined || weeklyPct === undefined) {
    const uniquePcts = [...new Set(usageMatches.map((m) => parseFloat(m[1])).filter((n) => !isNaN(n)))]
    if (sessionPct === undefined) sessionPct = uniquePcts[0] ?? 0
    if (weeklyPct === undefined) weeklyPct = uniquePcts[1] ?? uniquePcts[0] ?? 0
  }

  const timeRe = /class="[^"]*local-time[^"]*"[^>]*data-time="([^"]*)"/g
  const resetTimes = [...html.matchAll(timeRe)].map((m) => m[1])

  const planRe = /class="[^"]*capitalize[^"]*"[^>]*>([^<]*)</
  const planMatch = html.match(planRe)
  const planTier = planMatch ? planMatch[1].trim() : undefined

  // Balance and auto-reload
  const balanceM = html.match(/Balance remaining<\/div>[\s\S]*?>\$([\d.]+)/)
  const balance = balanceM ? "$" + balanceM[1] : undefined
  const autoReload = /name="enabled"[\s\S]*?["\s]checked["\s]/.test(html)

  // Parse per-model usage from data-usage-segment buttons
  // Each <button> has style="width: X%", data-usage-segment, data-model
  // The width is the model's share of the bar; we scale it to the actual total
  // so the models' contributions sum to the session/weekly total.
  function parseModels(html: string, totalPct: number): { name: string; requests: number; percent: number }[] | undefined {
    const buttonRe = /<button[\s\S]*?<\/button>/gi
    const seen = new Set<string>()
    let models: { name: string; requests: number; percent: number }[] | undefined
    for (const btn of html.matchAll(buttonRe)) {
      const btnHtml = btn[0]
      if (!btnHtml.includes("data-usage-segment")) continue
      const modelM = btnHtml.match(/data-model="([^"]*)"/)
      const widthM = btnHtml.match(/style="[^"]*width:\s*([\d.]+)%/)
      const reqM = btnHtml.match(/data-requests="(\d+)"/)
      if (!modelM || !widthM) continue
      const name = modelM[1].trim()
      const share = parseFloat(widthM[1])
      const requests = reqM ? parseInt(reqM[1], 10) : 0
      if (!name || isNaN(share) || share < 0 || share > 100) continue
      if (seen.has(name)) continue
      seen.add(name)
      if (!models) models = []
      models.push({ name, requests, percent: totalPct * (share / 100) })
    }
    if (models) models.sort((a, b) => b.percent - a.percent)
    return models
  }

  // Split by data-usage-meter to get session vs weekly blocks
  const meterSections = [...html.matchAll(/data-usage-meter[\s\S]*?<\/div>\s*<\/div>/gi)]
  const sessionModels = meterSections[0] ? parseModels(meterSections[0][0], sessionPct) : undefined
  const weeklyModels = meterSections[1] ? parseModels(meterSections[1][0], weeklyPct) : undefined

  return {
    data: {
      sessionPercent: sessionPct,
      weeklyPercent: weeklyPct,
      sessionReset: resetTimes[0],
      weeklyReset: resetTimes[1],
      planTier,
      balance,
      autoReload,
      sessionModels,
      weeklyModels,
    },
  }
}

async function scrapeUsage(cookie: string): Promise<{ data?: UsageData; error?: string }> {
  try {
    const resp = await fetch(SETTINGS_URL, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html",
        Cookie: `__Secure-session=${cookie}`,
      },
      redirect: "manual",
      signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
    })

    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get("location") || ""
      return { error: `Auth error: redirected to ${loc.slice(0, 60)} — cookie may be expired` }
    }

    if (!resp.ok) {
      return { error: `HTTP ${resp.status}` }
    }

    const html = await resp.text()
    return parseUsageFromHtml(html)
  } catch (err: any) {
    return { error: err?.message ?? String(err) }
  }
}

// ── Formatting helpers ────────────────────────────────────────────────────────
function barStr(ratio: number, w: number): string {
  const filled = Math.round(Math.min(ratio, 1) * w)
  return "█".repeat(Math.max(0, filled)) + "░".repeat(Math.max(0, w - filled))
}

function fmtPct(used: number): string {
  return `${used.toFixed(1)}%`
}

function fmtTime(iso?: string): string {
  if (!iso) return ""
  try {
    const d = new Date(iso)
    const now = new Date()
    const diff = d.getTime() - now.getTime()
    if (diff <= 0) return "resets now"
    const hours = Math.round(diff / 3600_000)
    if (hours < 24) return `in ${hours}h`
    const days = Math.round(hours / 24)
    return `in ${days}d`
  } catch {
    return ""
  }
}

// ── Plugin ───────────────────────────────────────────────────────────────────
const KV_EXP = "ollama-cloud:exp"
const KV_SESSION_EXP = "ollama-cloud:session:exp"
const KV_WEEKLY_EXP = "ollama-cloud:weekly:exp"

let init = false

const tui: TuiPlugin = async (api) => {
  if (init) return
  init = true

  let unsub: (() => void) | undefined
  let sd: (() => void) | undefined
  let timerId: ReturnType<typeof setInterval> | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined

  const cl = () => {
    try { unsub?.() } catch {}
    try { sd?.() } catch {}
    if (timerId) clearInterval(timerId)
    if (retryTimer) clearTimeout(retryTimer)
    init = false
  }

  try {
    if (api.lifecycle?.onDispose) api.lifecycle.onDispose(cl)
    if (!api.lifecycle?.onDispose && api.lifecycle?.signal)
      api.lifecycle.signal.addEventListener("abort", cl, { once: true })

    createRoot((dis) => {
      sd = dis

      // State: loading | error(msg) | help(no cookie) | data
      type State =
        | { kind: "loading" }
        | { kind: "error"; msg: string }
        | { kind: "help" }
        | { kind: "data"; d: UsageData }

      const [state, setState] = createSignal<State>({ kind: "loading" })
      const [expanded, setExpanded] = createSignal(
        api.kv?.get?.<boolean>(KV_EXP, true) !== false,
      )
      const [sessionExpanded, setSessionExpanded] = createSignal(
        api.kv?.get?.<boolean>(KV_SESSION_EXP, false) !== false,
      )
      const [weeklyExpanded, setWeeklyExpanded] = createSignal(
        api.kv?.get?.<boolean>(KV_WEEKLY_EXP, false) !== false,
      )

      async function refresh() {
        const resolved = await resolveCookie()
        if (!resolved.result) {
          setState({ kind: "help" })
          return
        }

        // Use shared cache to avoid hitting ollama.com more than once per minute
        // across all OpenCode sessions
        const cached = await readCache()
        if (cached) {
          setState({ kind: "data", d: cached })
          return
        }

        const scraped = await scrapeUsage(resolved.result.cookie)
        if (scraped.error) {
          setState({ kind: "error", msg: scraped.error })
          scheduleRetry(0)
          return
        }

        // Write to shared cache so other sessions can reuse
        await writeCache(scraped.data!)
        setState({ kind: "data", d: scraped.data! })
      }

      function scheduleRetry(attempt: number) {
        if (retryTimer) clearTimeout(retryTimer)
        if (attempt >= RETRY_DELAYS.length) return
        retryTimer = setTimeout(() => {
          refresh().then(() => {
            // On success after retry, resume normal interval
            if (timerId) clearInterval(timerId)
            timerId = setInterval(refresh, REFRESH_INTERVAL_MS)
          })
        }, RETRY_DELAYS[attempt])
      }

      // Initial fetch
      refresh()

      // Refresh every 60s
      timerId = setInterval(refresh, REFRESH_INTERVAL_MS)

      // Refresh on session activity too
      unsub = api.event?.on?.("session.updated", refresh)

      api.slots?.register?.({
        order: 220,
        slots: {
          sidebar_content(ctx, _props) {
            const s = state()
            const e = expanded()
            const fg = ctx.theme.current.text
            const mu = ctx.theme.current.textMuted
            const warn = ctx.theme.current.warning ?? "#e6a817"

            if (s.kind === "loading") {
              return (
                <box flexDirection="column">
                  <text fg={mu}>Ollama Cloud</text>
                  <text fg={mu}>Loading…</text>
                </box>
              )
            }

            if (s.kind === "help") {
              return (
                <box flexDirection="column">
                  <text fg={warn}>⚠ Ollama Cloud</text>
                  <text fg={mu}>No cookie configured</text>
                  <text fg={mu}>Set OLLAMA_USAGE_COOKIE</text>
                  <text fg={mu}>or create:</text>
                  <text fg={mu}>~/.config/opencode/</text>
                  <text fg={mu}>  opencode-quota/</text>
                  <text fg={mu}>    ollama-cloud.json</text>
                  <text fg={mu}>  → {"{"}"cookie":"...{"}"}</text>
                </box>
              )
            }

            if (s.kind === "error") {
              return (
                <box flexDirection="column">
                  <text fg={warn}>⚠ Ollama Cloud</text>
                  <text fg={mu}>{s.msg}</text>
                </box>
              )
            }

            // Data
            const d = s.d
            const sessionRemaining = 100 - d.sessionPercent
            const weeklyRemaining = 100 - d.weeklyPercent

            const sessionCircle = d.sessionPercent >= 100 ? "🔴 " : d.sessionPercent >= 90 ? "🟡 " : ""
            const weeklyCircle = d.weeklyPercent >= 100 ? "🔴 " : d.weeklyPercent >= 90 ? "🟡 " : ""

            return (
              <box flexDirection="column">
                <box
                  flexDirection="row"
                  justifyContent="space-between"
                  onMouseDown={() => {
                    const next = !e
                    setExpanded(next)
                    api.kv?.set?.(KV_EXP, next)
                  }}
                >
                  <text fg={fg}>{e ? "▼" : "▶"} Ollama Cloud{d.planTier ? ` (${d.planTier})` : ""}</text>
                  <text fg={fg}>{!e ? sessionCircle + "S " + fmtPct(d.sessionPercent) : d.balance ? (d.autoReload ? "AR " : "") + d.balance : ""}</text>
                </box>
                {e && (
                  <box flexDirection="column">
                    <box
                      flexDirection="row"
                      justifyContent="space-between"
                      onMouseDown={() => {
                        const next = !sessionExpanded()
                        setSessionExpanded(next)
                        api.kv?.set?.(KV_SESSION_EXP, next)
                      }}
                    >
                      <text fg={fg}>{sessionExpanded() ? "▼" : "▶"} {sessionCircle}Session</text>
                      <box flexDirection="row">
                        <text fg={mu}>{barStr(d.sessionPercent / 100, 8)} </text>
                        <text fg={fg}>{fmtPct(d.sessionPercent)}</text>
                      </box>
                    </box>
                    {sessionExpanded() && d.sessionModels && d.sessionModels.length > 0 && (
                      <box flexDirection="column">
                        {d.sessionModels.map((m) => (
                          <box flexDirection="row" justifyContent="space-between">
                            <text fg={fg}>{m.name}</text>
                            <text fg={fg}>{String(m.requests).padStart(3)}R {fmtPct(m.percent).padStart(5)}</text>
                          </box>
                        ))}
                      </box>
                    )}
                    {d.sessionReset && <text fg={mu}>Reset {fmtTime(d.sessionReset)}</text>}

                    <box
                      flexDirection="row"
                      justifyContent="space-between"
                      onMouseDown={() => {
                        const next = !weeklyExpanded()
                        setWeeklyExpanded(next)
                        api.kv?.set?.(KV_WEEKLY_EXP, next)
                      }}
                    >
                      <text fg={fg}>{weeklyExpanded() ? "▼" : "▶"} {weeklyCircle}Weekly</text>
                      <box flexDirection="row">
                        <text fg={mu}>{barStr(d.weeklyPercent / 100, 8)} </text>
                        <text fg={fg}>{fmtPct(d.weeklyPercent)}</text>
                      </box>
                    </box>
                    {weeklyExpanded() && d.weeklyModels && d.weeklyModels.length > 0 && (
                      <box flexDirection="column">
                        {d.weeklyModels.map((m) => (
                          <box flexDirection="row" justifyContent="space-between">
                            <text fg={fg}>{m.name}</text>
                            <text fg={fg}>{String(m.requests).padStart(3)}R {fmtPct(m.percent).padStart(5)}</text>
                          </box>
                        ))}
                      </box>
                    )}
                    {d.weeklyReset && <text fg={mu}>Reset {fmtTime(d.weeklyReset)}</text>}
                  </box>
                )}
              </box>
            )
          },
        },
      })
    })
  } catch (err) {
    cl()
    api.ui?.toast?.({ message: "ollama-cloud-usage failed", variant: "error" })
    throw err
  }
}

export default { id: "ollama-cloud-usage", tui }
