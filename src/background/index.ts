declare const chrome: any

const BANGUMI_BASE_URL = "https://api.bgm.tv"
const TRANSCRIBER_BASE_URL = "http://127.0.0.1:8765"

interface ChecklistRow {
  id: string
  rank: number
  title: string
  originalTitle: string
  year: string
  director: string
  rating: number
  poster: string
  genres: string[]
  summary: string
  url: string
  runtimeSeconds: number
}

interface ImdbAka {
  text?: string
  country?: { text?: string }
  language?: { text?: string }
}

// A few current Top 250 entries have no mainland-China AKA in IMDb. Keep these
// curated fallbacks small: the normal path below still follows IMDb as the list changes.
const IMDB_CHINESE_TITLE_OVERRIDES: Record<string, string> = {
  tt33175825: "剧场版《进击的巨人》完结篇 THE LAST ATTACK",
  tt31514146: "出口成脏",
  tt0058625: "砂之女",
  tt30472557: "剧场版《链锯人 蕾洁篇》",
  tt0252488: "捣蛋班留级了",
}

function imdbChineseTitle(node: any): string {
  const akas = Array.isArray(node?.akas?.edges)
    ? node.akas.edges.map((edge: any) => edge?.node as ImdbAka).filter(Boolean)
    : []
  const mainlandTitles = akas.filter((aka: ImdbAka) => aka?.country?.text === "China" && aka.text)
  const mainlandTitle = mainlandTitles.find((aka: ImdbAka) => /[\u3400-\u9fff]/u.test(aka.text || ""))?.text
    || mainlandTitles[0]?.text
  return String(
    mainlandTitle
      || IMDB_CHINESE_TITLE_OVERRIDES[String(node?.id || "")]
      || node?.titleText?.text
      || node?.originalTitleText?.text
      || "未命名电影",
  )
}

async function fetchTranscriberSnapshot(): Promise<{ queue: unknown[]; history: unknown[] }> {
  const [queueResponse, historyResponse] = await Promise.all([
    fetch(`${TRANSCRIBER_BASE_URL}/api/queue`),
    fetch(`${TRANSCRIBER_BASE_URL}/api/history?page=1&page_size=100`),
  ])
  if (!queueResponse.ok || !historyResponse.ok) {
    throw new Error("Transcriber 状态读取失败，请确认本地服务正在运行")
  }
  const queue = await queueResponse.json()
  const historyPayload = await historyResponse.json()
  return {
    queue: Array.isArray(queue) ? queue : [],
    history: Array.isArray(historyPayload?.items) ? historyPayload.items : [],
  }
}

async function fetchImdbChecklist(): Promise<ChecklistRow[]> {
  const query = `query BillNextTop250 {
    chartTitles(first: 250, chart: { chartType: TOP_RATED_MOVIES }) {
      edges { node {
        id titleText { text } originalTitleText { text } releaseYear { year }
        primaryImage { url } ratingsSummary { aggregateRating topRanking { rank } }
        genres { genres { text } } plot { plotText { plainText } } runtime { seconds }
        principalCredits { category { text } credits { name { nameText { text } } } }
        akas(first: 250) { edges { node { text country { text } language { text } } } }
      } }
    }
  }`
  const response = await fetch("https://api.graphql.imdb.com/", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8", Referer: "https://www.imdb.com/" },
    body: JSON.stringify({ query }),
  })
  const payload = await response.json().catch(() => null) as any
  if (!response.ok || !Array.isArray(payload?.data?.chartTitles?.edges)) throw new Error(`IMDb 榜单请求失败（${response.status}）`)
  return payload.data.chartTitles.edges.map((edge: any, index: number) => ({
    id: String(edge?.node?.id || ""),
    rank: Number(edge?.node?.ratingsSummary?.topRanking?.rank || index + 1),
    title: imdbChineseTitle(edge?.node),
    originalTitle: String(edge?.node?.originalTitleText?.text || ""),
    year: String(edge?.node?.releaseYear?.year || ""),
    director: String(edge?.node?.principalCredits?.find((credit: any) => /director/i.test(String(credit?.category?.text || "")))?.credits?.[0]?.name?.nameText?.text || ""),
    rating: Number(edge?.node?.ratingsSummary?.aggregateRating || 0),
    poster: String(edge?.node?.primaryImage?.url || ""),
    genres: Array.isArray(edge?.node?.genres?.genres) ? edge.node.genres.genres.map((genre: any) => String(genre?.text || "")).filter(Boolean).slice(0, 3) : [],
    summary: String(edge?.node?.plot?.plotText?.plainText || ""),
    url: `https://www.imdb.com/title/${edge?.node?.id || ""}/`,
    runtimeSeconds: Number(edge?.node?.runtime?.seconds || 0),
  })).filter((item: ChecklistRow) => item.id)
}

async function fetchDoubanChecklist(): Promise<ChecklistRow[]> {
  const pages = await Promise.all(Array.from({ length: 5 }, async (_, page) => {
    const start = page * 50
    const response = await fetch(`https://m.douban.com/rexxar/api/v2/subject_collection/movie_top250/items?start=${start}&count=50`, {
      headers: { Accept: "application/json", Referer: "https://movie.douban.com/top250" },
    })
    const payload = await response.json().catch(() => null) as any
    if (!response.ok) throw new Error(`豆瓣榜单请求失败（${response.status}）`)
    const items = payload?.subject_collection_items ?? payload?.items
    if (!Array.isArray(items)) throw new Error("豆瓣榜单返回格式异常")
    return items
  }))
  return pages.flat().map((item: any, index: number) => {
    const subtitle = String(item?.card_subtitle || "")
    const segments = subtitle.split("/").map((part) => part.trim()).filter(Boolean)
    return {
      id: String(item?.id || item?.subject?.id || ""),
      rank: index + 1,
      title: String(item?.title || item?.subject?.title || "未命名电影"),
      originalTitle: String(item?.subtitle || item?.original_title || ""),
      year: subtitle.match(/\b(?:19|20)\d{2}\b/)?.[0] || "",
      director: String(segments[3] || ""),
      rating: Number(item?.rating?.value || item?.rating?.score || 0),
      poster: String(item?.pic?.large || item?.pic?.normal || item?.cover_url || ""),
      genres: segments.filter((part) => !/^\d{4}$/.test(part) && part.length <= 8).slice(-3),
      summary: String(item?.comment || item?.description || ""),
      url: String(item?.url || `https://movie.douban.com/subject/${item?.id || ""}/`),
      runtimeSeconds: parseChecklistRuntime(item?.duration || item?.subject?.duration || subtitle),
    }
  }).filter((item: ChecklistRow) => item.id)
}

async function fetchBangumiChecklist(): Promise<ChecklistRow[]> {
  const response = await fetch(`${BANGUMI_BASE_URL}/v0/subjects?type=2&sort=rank&limit=100&offset=0`, {
    headers: { Accept: "application/json", "User-Agent": "BillNext/2.0 (classic checklist)" },
  })
  const payload = await response.json().catch(() => null) as any
  if (!response.ok || !Array.isArray(payload?.data)) throw new Error(`Bangumi 榜单请求失败（${response.status}）`)
  return payload.data.map((item: any, index: number) => ({
    id: String(item?.id || ""),
    rank: Number(item?.rating?.rank || item?.rank || index + 1),
    title: String(item?.name_cn || item?.name || "未命名动画"),
    originalTitle: String(item?.name || ""),
    year: String(item?.date || "").slice(0, 4),
    director: "",
    rating: Number(item?.rating?.score || 0),
    poster: String(item?.images?.large || item?.images?.common || item?.images?.medium || ""),
    genres: Array.isArray(item?.tags) ? item.tags.slice(0, 3).map((tag: any) => String(tag?.name || "")).filter(Boolean) : [],
    summary: String(item?.summary || ""),
    url: `https://bgm.tv/subject/${item?.id || ""}`,
    runtimeSeconds: 0,
  })).filter((item: ChecklistRow) => item.id)
}

function parseChecklistRuntime(value: unknown): number {
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = parseChecklistRuntime(item)
      if (parsed) return parsed
    }
    return 0
  }
  if (typeof value === "number" && Number.isFinite(value)) return value > 300 ? Math.round(value) : Math.round(value * 60)
  if (typeof value !== "string") return 0
  const iso = value.match(/PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+)M)?/i)
  if (iso) return Math.round((Number(iso[1] || 0) * 60 + Number(iso[2] || 0)) * 60)
  const hours = Number(value.match(/(\d+(?:\.\d+)?)\s*(?:小时|小時|hours?|hrs?)/i)?.[1] || 0)
  const minutes = Number(value.match(/(\d+)\s*(?:分钟|分鐘|mins?|minutes?)/i)?.[1] || 0)
  if (hours || minutes) return Math.round((hours * 60 + minutes) * 60)
  const clock = value.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/)
  if (clock) return Number(clock[1] || 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3])
  if (/^\d+(?:\.\d+)?$/.test(value.trim())) {
    const numeric = Number(value.trim())
    return numeric > 300 ? Math.round(numeric) : Math.round(numeric * 60)
  }
  return 0
}

async function fetchImdbRuntimeByTitle(title: string, year: string): Promise<number> {
  if (!title.trim()) return 0
  const suggestionResponse = await fetch(`https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(title.trim())}.json`)
  const suggestionPayload = await suggestionResponse.json().catch(() => null) as { d?: Array<{ id?: string; y?: number }> } | null
  if (!suggestionResponse.ok) return 0
  const candidates = Array.isArray(suggestionPayload?.d) ? suggestionPayload.d.filter((item) => /^tt\d+$/.test(String(item?.id || ""))) : []
  const expectedYear = Number(year)
  const match = candidates.find((item) => expectedYear && Number(item.y) === expectedYear) || candidates[0]
  if (!match?.id) return 0
  const query = `query BillNextRuntime($ids: [ID!]!) { titles(ids: $ids) { id runtime { seconds } } }`
  const runtimeResponse = await fetch("https://api.graphql.imdb.com/", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Referer: "https://www.imdb.com/" },
    body: JSON.stringify({ query, variables: { ids: [match.id] } }),
  })
  const runtimePayload = await runtimeResponse.json().catch(() => null) as any
  return runtimeResponse.ok ? Number(runtimePayload?.data?.titles?.[0]?.runtime?.seconds || 0) : 0
}

async function fetchDoubanRuntime(id: string, title: string, year: string): Promise<number> {
  const headers = { Accept: "application/json,text/html", Referer: `https://m.douban.com/movie/subject/${id}/` }
  try {
    const detailResponse = await fetch(`https://m.douban.com/rexxar/api/v2/movie/${id}`, { headers })
    if (detailResponse.ok) {
      const detail = await detailResponse.json().catch(() => null) as any
      const runtime = parseChecklistRuntime(detail?.durations || detail?.duration || detail?.subject?.durations || detail?.subject?.duration)
      if (runtime) return runtime
    }
    const pageResponse = await fetch(`https://m.douban.com/movie/subject/${id}/`, { headers })
    if (pageResponse.ok) {
      const html = await pageResponse.text()
      const runtime = parseChecklistRuntime(
        html.match(/property=["']v:runtime["'][^>]*content=["']([^"']+)/i)?.[1]
          || html.match(/["']duration["']\s*:\s*["']([^"']+)/i)?.[1]
          || html.match(/片长[^\d]{0,80}(\d+\s*分钟)/i)?.[1]
          || "",
      )
      if (runtime) return runtime
    }
  } catch {
    // Fall through to IMDb's title/year lookup when Douban is unavailable or rate-limited.
  }
  return fetchImdbRuntimeByTitle(title, year)
}

async function fetchChecklist(kind: string): Promise<ChecklistRow[]> {
  if (kind === "imdb") return fetchImdbChecklist()
  if (kind === "douban") return fetchDoubanChecklist()
  if (kind === "bangumi") return fetchBangumiChecklist()
  throw new Error("未知榜单")
}

chrome.runtime.onMessage.addListener((message: any, sender: any, sendResponse: (value: unknown) => void) => {
  if (message?.type === "tabs:open-background") {
    try {
      const url = new URL(typeof message.url === "string" ? message.url : "")
      const allowedHost = url.hostname === "bilibili.com" || url.hostname.endsWith(".bilibili.com") || url.hostname === "b23.tv"
      if (url.protocol !== "https:" || !allowedHost) {
        sendResponse({ ok: false, error: "不允许打开非 B 站链接" })
        return false
      }

      const createProperties: Record<string, unknown> = { url: url.href, active: false }
      if (typeof sender?.tab?.windowId === "number") createProperties.windowId = sender.tab.windowId
      chrome.tabs.create(createProperties, () => {
        const runtimeError = chrome.runtime.lastError
        sendResponse(runtimeError ? { ok: false, error: runtimeError.message } : { ok: true })
      })
      return true
    } catch {
      sendResponse({ ok: false, error: "视频链接无效" })
      return false
    }
  }
  if (message?.type === "checklist:runtime") {
    const kind = String(message.kind || "")
    const id = String(message.id || "")
    const title = String(message.title || "")
    const year = String(message.year || "")
    if (kind !== "douban" || !/^\d+$/.test(id)) {
      sendResponse({ ok: false, error: "不支持的片长来源" })
      return false
    }
    void fetchDoubanRuntime(id, title, year)
      .then((runtimeSeconds) => sendResponse({ ok: true, runtimeSeconds }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }))
    return true
  }
  if (message?.type === "checklist:fetch") {
    void fetchChecklist(String(message.kind || ""))
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }))
    return true
  }
  if (message?.type === "bangumi:request") {
    const path = typeof message.path === "string" ? message.path : ""
    const method = message.init?.method === "POST" ? "POST" : "GET"
    if (!/^\/v0\/(?:search\/subjects|subjects\/\d+|episodes)(?:[/?].*)?$/.test(path)) {
      sendResponse({ ok: false, error: "不允许的 Bangumi API 路径" })
      return false
    }
    void fetch(`${BANGUMI_BASE_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: method === "POST" ? JSON.stringify(message.init?.body ?? {}) : undefined,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (!response.ok) throw new Error(data?.description || `Bangumi 请求失败（${response.status}）`)
        sendResponse({ ok: true, data })
      })
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }))
    return true
  }
  if (message?.type === "transcriber:snapshot") {
    void fetchTranscriberSnapshot()
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }))
    return true
  }
  return false
})
