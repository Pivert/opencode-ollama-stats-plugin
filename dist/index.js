// index.tsx
import { createRoot, createSignal } from "solid-js";
import { jsx, jsxs } from "@opentui/solid/jsx-runtime";
var CONFIG_PATHS = [
  { path: process.env.HOME + "/.config/opencode/opencode-quota/ollama-cloud.json", type: "json" },
  { path: process.env.HOME + "/.config/ollama-usage/config.yaml", type: "yaml" },
  { path: process.env.HOME + "/.ollama-usage/config.yaml", type: "yaml" }
];
var SETTINGS_URL = "https://ollama.com/settings";
var USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Gecko/20100101 Firefox/148.0";
var SCRAPE_TIMEOUT_MS = 1e4;
var REFRESH_INTERVAL_MS = 6e4;
function readYamlCookie(content) {
  const stripped = content.replace(/#[^\n]*/g, "");
  const m = stripped.match(/(?:^|\n)\s*cookie\s*:\s*["']?\s*(.+?)\s*["']?\s*(?:\n|$)/);
  return m ? m[1].trim() : null;
}
async function resolveCookie() {
  const env = process.env.OLLAMA_USAGE_COOKIE?.trim();
  if (env) return { result: { cookie: env, source: "OLLAMA_USAGE_COOKIE" } };
  for (const { path, type } of CONFIG_PATHS) {
    try {
      const fs = await import("fs/promises");
      const content = await fs.readFile(path, "utf-8");
      let cookie = null;
      if (type === "json") {
        const parsed = JSON.parse(content);
        cookie = typeof parsed.cookie === "string" ? parsed.cookie.trim() : null;
      } else {
        cookie = readYamlCookie(content);
      }
      if (cookie) return { result: { cookie, source: path } };
    } catch (err) {
      if (err?.code !== "ENOENT") {
        return { error: `Error reading ${path}: ${err.message}` };
      }
    }
  }
  return { error: "no cookie found" };
}
var CACHE_DIR = process.env.HOME + "/.config/opencode/opencode-quota";
var CACHE_FILE = CACHE_DIR + "/ollama-cloud-cache.json";
var CACHE_TTL_MS = 6e4;
async function readCache() {
  try {
    const fs = await import("fs/promises");
    const content = await fs.readFile(CACHE_FILE, "utf-8");
    const entry = JSON.parse(content);
    const age = Date.now() - new Date(entry.cached_at).getTime();
    if (age < CACHE_TTL_MS) return entry.data;
    return null;
  } catch {
    return null;
  }
}
async function writeCache(data) {
  try {
    const fs = await import("fs/promises");
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const entry = { cached_at: (/* @__PURE__ */ new Date()).toISOString(), data };
    await fs.writeFile(CACHE_FILE, JSON.stringify(entry), "utf-8");
  } catch {
  }
}
var RETRY_DELAYS = [5e3, 15e3, 3e4];
function parseUsageFromHtml(html) {
  const usageRe = /(\d+(?:\.\d+)?)%\s*used/gi;
  const usageMatches = [...html.matchAll(usageRe)];
  if (usageMatches.length === 0) {
    return { error: "No usage data found on settings page" };
  }
  let sessionPct;
  let weeklyPct;
  for (const match of usageMatches) {
    const pct = parseFloat(match[1]);
    if (isNaN(pct)) continue;
    const pos = match.index;
    const context = html.slice(Math.max(0, pos - 500), pos).toLowerCase();
    if (context.includes("session")) {
      sessionPct = pct;
    } else if (context.includes("weekly")) {
      weeklyPct = pct;
    }
  }
  if (sessionPct === void 0 || weeklyPct === void 0) {
    const uniquePcts = [...new Set(usageMatches.map((m) => parseFloat(m[1])).filter((n) => !isNaN(n)))];
    if (sessionPct === void 0) sessionPct = uniquePcts[0] ?? 0;
    if (weeklyPct === void 0) weeklyPct = uniquePcts[1] ?? uniquePcts[0] ?? 0;
  }
  const timeRe = /class="[^"]*local-time[^"]*"[^>]*data-time="([^"]*)"/g;
  const resetTimes = [...html.matchAll(timeRe)].map((m) => m[1]);
  const planRe = /class="[^"]*capitalize[^"]*"[^>]*>([^<]*)</;
  const planMatch = html.match(planRe);
  const planTier = planMatch ? planMatch[1].trim() : void 0;
  const balanceM = html.match(/Balance remaining<\/div>[\s\S]*?>\$([\d.]+)/);
  const balance = balanceM ? "$" + balanceM[1] : void 0;
  const autoReload = /name="enabled"[\s\S]*?["\s]checked["\s]/.test(html);
  function parseModels(html2, totalPct) {
    const buttonRe = /<button[\s\S]*?<\/button>/gi;
    const seen = /* @__PURE__ */ new Set();
    let models;
    for (const btn of html2.matchAll(buttonRe)) {
      const btnHtml = btn[0];
      if (!btnHtml.includes("data-usage-segment")) continue;
      const modelM = btnHtml.match(/data-model="([^"]*)"/);
      const widthM = btnHtml.match(/style="[^"]*width:\s*([\d.]+)%/);
      const reqM = btnHtml.match(/data-requests="(\d+)"/);
      if (!modelM || !widthM) continue;
      const name = modelM[1].trim();
      const share = parseFloat(widthM[1]);
      const requests = reqM ? parseInt(reqM[1], 10) : 0;
      if (!name || isNaN(share) || share < 0 || share > 100) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      if (!models) models = [];
      models.push({ name, requests, percent: totalPct * (share / 100) });
    }
    if (models) models.sort((a, b) => b.percent - a.percent);
    return models;
  }
  const meterSections = [...html.matchAll(/data-usage-meter[\s\S]*?<\/div>\s*<\/div>/gi)];
  const sessionModels = meterSections[0] ? parseModels(meterSections[0][0], sessionPct) : void 0;
  const weeklyModels = meterSections[1] ? parseModels(meterSections[1][0], weeklyPct) : void 0;
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
      weeklyModels
    }
  };
}
async function scrapeUsage(cookie) {
  try {
    const resp = await fetch(SETTINGS_URL, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html",
        Cookie: `__Secure-session=${cookie}`
      },
      redirect: "manual",
      signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS)
    });
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get("location") || "";
      return { error: `Auth error: redirected to ${loc.slice(0, 60)} \u2014 cookie may be expired` };
    }
    if (!resp.ok) {
      return { error: `HTTP ${resp.status}` };
    }
    const html = await resp.text();
    return parseUsageFromHtml(html);
  } catch (err) {
    return { error: err?.message ?? String(err) };
  }
}
function barStr(ratio, w) {
  const filled = Math.round(Math.min(ratio, 1) * w);
  return "\u2588".repeat(Math.max(0, filled)) + "\u2591".repeat(Math.max(0, w - filled));
}
function fmtPct(used) {
  return `${used.toFixed(1)}%`;
}
function fmtTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const now = /* @__PURE__ */ new Date();
    const diff = d.getTime() - now.getTime();
    if (diff <= 0) return "resets now";
    const hours = Math.round(diff / 36e5);
    if (hours < 24) return `in ${hours}h`;
    const days = Math.round(hours / 24);
    return `in ${days}d`;
  } catch {
    return "";
  }
}
var KV_EXP = "ollama-cloud:exp";
var KV_SESSION_EXP = "ollama-cloud:session:exp";
var KV_WEEKLY_EXP = "ollama-cloud:weekly:exp";
var init = false;
var tui = async (api) => {
  if (init) return;
  init = true;
  let unsub;
  let sd;
  let timerId;
  let retryTimer;
  const cl = () => {
    try {
      unsub?.();
    } catch {
    }
    try {
      sd?.();
    } catch {
    }
    if (timerId) clearInterval(timerId);
    if (retryTimer) clearTimeout(retryTimer);
    init = false;
  };
  try {
    if (api.lifecycle?.onDispose) api.lifecycle.onDispose(cl);
    if (!api.lifecycle?.onDispose && api.lifecycle?.signal)
      api.lifecycle.signal.addEventListener("abort", cl, { once: true });
    createRoot((dis) => {
      sd = dis;
      const [state, setState] = createSignal({ kind: "loading" });
      const [expanded, setExpanded] = createSignal(
        api.kv?.get?.(KV_EXP, true) !== false
      );
      const [sessionExpanded, setSessionExpanded] = createSignal(
        api.kv?.get?.(KV_SESSION_EXP, false) !== false
      );
      const [weeklyExpanded, setWeeklyExpanded] = createSignal(
        api.kv?.get?.(KV_WEEKLY_EXP, false) !== false
      );
      async function refresh() {
        const resolved = await resolveCookie();
        if (!resolved.result) {
          setState({ kind: "help" });
          return;
        }
        const cached = await readCache();
        if (cached) {
          setState({ kind: "data", d: cached });
          return;
        }
        const scraped = await scrapeUsage(resolved.result.cookie);
        if (scraped.error) {
          setState({ kind: "error", msg: scraped.error });
          scheduleRetry(0);
          return;
        }
        await writeCache(scraped.data);
        setState({ kind: "data", d: scraped.data });
      }
      function scheduleRetry(attempt) {
        if (retryTimer) clearTimeout(retryTimer);
        if (attempt >= RETRY_DELAYS.length) return;
        retryTimer = setTimeout(() => {
          refresh().then(() => {
            if (timerId) clearInterval(timerId);
            timerId = setInterval(refresh, REFRESH_INTERVAL_MS);
          });
        }, RETRY_DELAYS[attempt]);
      }
      refresh();
      timerId = setInterval(refresh, REFRESH_INTERVAL_MS);
      unsub = api.event?.on?.("session.updated", refresh);
      api.slots?.register?.({
        order: 220,
        slots: {
          sidebar_content(ctx, _props) {
            const s = state();
            const e = expanded();
            const fg = ctx.theme.current.text;
            const mu = ctx.theme.current.textMuted;
            const warn = ctx.theme.current.warning ?? "#e6a817";
            if (s.kind === "loading") {
              return /* @__PURE__ */ jsxs("box", { flexDirection: "column", children: [
                /* @__PURE__ */ jsx("text", { fg: mu, children: "Ollama Cloud" }),
                /* @__PURE__ */ jsx("text", { fg: mu, children: "Loading\u2026" })
              ] });
            }
            if (s.kind === "help") {
              return /* @__PURE__ */ jsxs("box", { flexDirection: "column", children: [
                /* @__PURE__ */ jsx("text", { fg: warn, children: "\u26A0 Ollama Cloud" }),
                /* @__PURE__ */ jsx("text", { fg: mu, children: "No cookie configured" }),
                /* @__PURE__ */ jsx("text", { fg: mu, children: "Set OLLAMA_USAGE_COOKIE" }),
                /* @__PURE__ */ jsx("text", { fg: mu, children: "or create:" }),
                /* @__PURE__ */ jsx("text", { fg: mu, children: "~/.config/opencode/" }),
                /* @__PURE__ */ jsx("text", { fg: mu, children: "  opencode-quota/" }),
                /* @__PURE__ */ jsx("text", { fg: mu, children: "    ollama-cloud.json" }),
                /* @__PURE__ */ jsxs("text", { fg: mu, children: [
                  "  \u2192 ",
                  "{",
                  '"cookie":"...',
                  "}"
                ] })
              ] });
            }
            if (s.kind === "error") {
              return /* @__PURE__ */ jsxs("box", { flexDirection: "column", children: [
                /* @__PURE__ */ jsx("text", { fg: warn, children: "\u26A0 Ollama Cloud" }),
                /* @__PURE__ */ jsx("text", { fg: mu, children: s.msg })
              ] });
            }
            const d = s.d;
            const sessionRemaining = 100 - d.sessionPercent;
            const weeklyRemaining = 100 - d.weeklyPercent;
            const sessionCircle = d.sessionPercent >= 100 ? "\u{1F534} " : d.sessionPercent >= 90 ? "\u{1F7E1} " : "";
            const weeklyCircle = d.weeklyPercent >= 100 ? "\u{1F534} " : d.weeklyPercent >= 90 ? "\u{1F7E1} " : "";
            return /* @__PURE__ */ jsxs("box", { flexDirection: "column", children: [
              /* @__PURE__ */ jsxs(
                "box",
                {
                  flexDirection: "row",
                  justifyContent: "space-between",
                  onMouseDown: () => {
                    const next = !e;
                    setExpanded(next);
                    api.kv?.set?.(KV_EXP, next);
                  },
                  children: [
                    /* @__PURE__ */ jsxs("text", { fg, children: [
                      e ? "\u25BC" : "\u25B6",
                      " Ollama Cloud",
                      d.planTier ? ` (${d.planTier})` : ""
                    ] }),
                    /* @__PURE__ */ jsx("text", { fg, children: !e ? sessionCircle + "S " + fmtPct(d.sessionPercent) : d.balance ? (d.autoReload ? "AR " : "") + d.balance : "" })
                  ]
                }
              ),
              e && /* @__PURE__ */ jsxs("box", { flexDirection: "column", children: [
                /* @__PURE__ */ jsxs(
                  "box",
                  {
                    flexDirection: "row",
                    justifyContent: "space-between",
                    onMouseDown: () => {
                      const next = !sessionExpanded();
                      setSessionExpanded(next);
                      api.kv?.set?.(KV_SESSION_EXP, next);
                    },
                    children: [
                      /* @__PURE__ */ jsxs("text", { fg, children: [
                        sessionExpanded() ? "\u25BC" : "\u25B6",
                        " ",
                        sessionCircle,
                        "Session"
                      ] }),
                      /* @__PURE__ */ jsxs("box", { flexDirection: "row", children: [
                        /* @__PURE__ */ jsxs("text", { fg: mu, children: [
                          barStr(d.sessionPercent / 100, 8),
                          " "
                        ] }),
                        /* @__PURE__ */ jsx("text", { fg, children: fmtPct(d.sessionPercent) })
                      ] })
                    ]
                  }
                ),
                sessionExpanded() && d.sessionModels && d.sessionModels.length > 0 && /* @__PURE__ */ jsx("box", { flexDirection: "column", children: d.sessionModels.map((m) => /* @__PURE__ */ jsxs("box", { flexDirection: "row", justifyContent: "space-between", children: [
                  /* @__PURE__ */ jsx("text", { fg, children: m.name }),
                  /* @__PURE__ */ jsxs("text", { fg, children: [
                    m.requests,
                    "R ",
                    fmtPct(m.percent)
                  ] })
                ] })) }),
                d.sessionReset && /* @__PURE__ */ jsxs("text", { fg: mu, children: [
                  "Reset ",
                  fmtTime(d.sessionReset)
                ] }),
                /* @__PURE__ */ jsxs(
                  "box",
                  {
                    flexDirection: "row",
                    justifyContent: "space-between",
                    onMouseDown: () => {
                      const next = !weeklyExpanded();
                      setWeeklyExpanded(next);
                      api.kv?.set?.(KV_WEEKLY_EXP, next);
                    },
                    children: [
                      /* @__PURE__ */ jsxs("text", { fg, children: [
                        weeklyExpanded() ? "\u25BC" : "\u25B6",
                        " ",
                        weeklyCircle,
                        "Weekly"
                      ] }),
                      /* @__PURE__ */ jsxs("box", { flexDirection: "row", children: [
                        /* @__PURE__ */ jsxs("text", { fg: mu, children: [
                          barStr(d.weeklyPercent / 100, 8),
                          " "
                        ] }),
                        /* @__PURE__ */ jsx("text", { fg, children: fmtPct(d.weeklyPercent) })
                      ] })
                    ]
                  }
                ),
                weeklyExpanded() && d.weeklyModels && d.weeklyModels.length > 0 && /* @__PURE__ */ jsx("box", { flexDirection: "column", children: d.weeklyModels.map((m) => /* @__PURE__ */ jsxs("box", { flexDirection: "row", justifyContent: "space-between", children: [
                  /* @__PURE__ */ jsx("text", { fg, children: m.name }),
                  /* @__PURE__ */ jsxs("text", { fg, children: [
                    m.requests,
                    "R ",
                    fmtPct(m.percent)
                  ] })
                ] })) }),
                d.weeklyReset && /* @__PURE__ */ jsxs("text", { fg: mu, children: [
                  "Reset ",
                  fmtTime(d.weeklyReset)
                ] })
              ] })
            ] });
          }
        }
      });
    });
  } catch (err) {
    cl();
    api.ui?.toast?.({ message: "ollama-cloud-usage failed", variant: "error" });
    throw err;
  }
};
var index_default = { id: "ollama-cloud-usage", tui };
export {
  index_default as default
};
