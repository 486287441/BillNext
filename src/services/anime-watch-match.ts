import { pageFetch } from "./page-fetch"
import { invalidateWbiKeys, signWbiParams } from "./wbi-sign"

const SEARCH_ENDPOINT = "https://api.bilibili.com/x/web-interface/wbi/search/type"
const MIN_PLAY_COUNT = 50_000
const SEARCH_ORDERS = ["totalrank", "click", "dm"] as const
const PRIMARY_SEARCH_ATTEMPTS = 2
const PRIMARY_RETRY_DELAY_MS = 250

interface BilibiliSearchVideo {
  aid?: number
  bvid?: string
  title?: string
  arcurl?: string
  play?: number | string
  danmaku?: number | string
  duration?: number | string
  author?: string
}

interface ScoredCandidate {
  item: BilibiliSearchVideo
  title: string
  playCount: number
  danmakuCount: number
  durationSeconds: number
  relevance: number
  score: number
}

export interface AnimeWatchMatch {
  title: string
  url: string
  author: string
  playCount: number
  danmakuCount: number
  durationSeconds: number
  score: number
}

function plainText(value: unknown): string {
  return typeof value === "string"
    ? value
      .replace(/<[^>]*>/g, "")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .trim()
    : ""
}

function normalizeTitle(value: string): string {
  return plainText(value).toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "")
}

function bigramSimilarity(left: string, right: string): number {
  if (!left || !right) return 0
  if (left === right) return 1
  if (left.includes(right) || right.includes(left)) return Math.min(left.length, right.length) / Math.max(left.length, right.length)
  const pairs = (value: string) => new Set(Array.from({ length: Math.max(0, value.length - 1) }, (_, index) => value.slice(index, index + 2)))
  const leftPairs = pairs(left)
  const rightPairs = pairs(right)
  if (!leftPairs.size || !rightPairs.size) return 0
  let overlap = 0
  for (const pair of leftPairs) if (rightPairs.has(pair)) overlap += 1
  return 2 * overlap / (leftPairs.size + rightPairs.size)
}

function parseCount(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, value) : 0
  if (typeof value !== "string") return 0
  const normalized = value.trim().replace(/,/g, "")
  const number = Number.parseFloat(normalized)
  if (!Number.isFinite(number)) return 0
  if (normalized.includes("亿")) return Math.round(number * 100_000_000)
  if (normalized.includes("万")) return Math.round(number * 10_000)
  return Math.max(0, Math.round(number))
}

function parseDuration(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, value) : 0
  if (typeof value !== "string") return 0
  const parts = value.split(":").map(Number)
  if (!parts.length || parts.some((part) => !Number.isFinite(part) || part < 0)) return 0
  return parts.reduce((total, part) => total * 60 + part, 0)
}

function scoreCandidate(query: string, item: BilibiliSearchVideo): ScoredCandidate | null {
  const title = plainText(item.title)
  const normalizedQuery = normalizeTitle(query)
  const normalizedTitle = normalizeTitle(title)
  if (!title || !normalizedQuery || !normalizedTitle) return null

  const similarity = bigramSimilarity(normalizedQuery, normalizedTitle)
  let relevance = normalizedTitle.includes(normalizedQuery) ? 72 : similarity * 72
  if (normalizedTitle.startsWith(normalizedQuery)) relevance += 8
  if (new RegExp(`[【《「『\\[][^】》」』\\]]*${escapeRegExp(query.trim())}`, "i").test(title)) relevance += 10
  if (relevance < 48) return null

  const playCount = parseCount(item.play)
  const danmakuCount = parseCount(item.danmaku)
  if (playCount < MIN_PLAY_COUNT) return null
  const durationSeconds = parseDuration(item.duration)

  const fullSeries = /全\s*\d+\s*[话話集]|全集|全话|全話|完整(?:版|合集)|完结合集|未删减版/i.test(title)
  const collection = /合集|合辑|正片|超清|高清|中字|字幕|未删减|补档|周更|持续更新/i.test(title)
  const misleading = /解说|解析|吐槽|盘点|reaction|剪辑|片段|预告|\b(?:op|ed|ost)\b|主题曲|音乐|配音|声优|人物介绍|漫评|杂谈|速看|一口气看完|名场面|鬼畜|手书|翻唱|舞蹈/i.test(title)

  let contentScore = 0
  if (fullSeries) contentScore += 46
  if (collection) contentScore += 18
  if (misleading) contentScore -= fullSeries ? 28 : 62
  if (durationSeconds >= 6 * 3600) contentScore += 32
  else if (durationSeconds >= 3 * 3600) contentScore += 26
  else if (durationSeconds >= 3600) contentScore += 18
  else if (durationSeconds > 0 && durationSeconds < 10 * 60) contentScore -= 46
  else if (durationSeconds > 0 && durationSeconds < 24 * 60) contentScore -= 20

  const heatScore = Math.log10(playCount + 1) * 6 + Math.log10(danmakuCount + 1) * 4
  return {
    item,
    title,
    playCount,
    danmakuCount,
    durationSeconds,
    relevance,
    score: relevance + contentScore + heatScore,
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

async function searchPage(keyword: string, order: typeof SEARCH_ORDERS[number], retry = true): Promise<BilibiliSearchVideo[]> {
  const query = await signWbiParams({
    keyword,
    search_type: "video",
    order,
    page: 1,
    page_size: 42,
  })
  const response = await pageFetch(`${SEARCH_ENDPOINT}?${query.toString()}`, { headers: { Referer: "https://search.bilibili.com/" } })
  const payload = await response.json().catch(() => null) as {
    code?: number
    message?: string
    data?: { result?: BilibiliSearchVideo[] }
  } | null
  if (retry && (payload?.code === -352 || payload?.code === -403)) {
    invalidateWbiKeys()
    return searchPage(keyword, order, false)
  }
  if (!response.ok || payload?.code !== 0) throw new Error(payload?.message || `B 站搜索失败（${response.status}）`)
  return Array.isArray(payload.data?.result) ? payload.data.result : []
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

async function searchPageReliably(
  keyword: string,
  order: typeof SEARCH_ORDERS[number] = "totalrank",
): Promise<BilibiliSearchVideo[]> {
  let lastError: unknown
  for (let attempt = 0; attempt < PRIMARY_SEARCH_ATTEMPTS; attempt += 1) {
    try {
      return await searchPage(keyword, order)
    } catch (caught) {
      lastError = caught
      if (attempt + 1 < PRIMARY_SEARCH_ATTEMPTS) await delay(PRIMARY_RETRY_DELAY_MS)
    }
  }
  throw lastError instanceof Error ? lastError : new Error("B 站综合排序请求失败")
}

export async function findBestAnimeWatchLink(title: string): Promise<AnimeWatchMatch> {
  const keyword = title.trim()
  if (!keyword) throw new Error("请先填写番剧名称")
  let primaryVideos: BilibiliSearchVideo[]
  try {
    primaryVideos = await searchPageReliably(keyword)
  } catch (caught) {
    const reason = caught instanceof Error ? `：${caught.message}` : ""
    throw new Error(`B 站综合排序暂时不可用，请稍后重试${reason}`)
  }

  // 裸番名容易被热门短视频污染；追加“合集”意图词，让 B 站召回真正的正片/全集。
  let collectionVideos: BilibiliSearchVideo[] = []
  try {
    collectionVideos = await searchPageReliably(`${keyword} 合集`)
  } catch {
    // 定向搜索只是增强项，失败时仍使用原始三路视频搜索结果。
  }

  // 综合排序是候选基准；其余两路只做补充，并按顺序请求以避免触发并发风控。
  const supplementalVideos: BilibiliSearchVideo[] = []
  for (const order of SEARCH_ORDERS.slice(1)) {
    try {
      supplementalVideos.push(...await searchPage(keyword, order))
    } catch {
      // 补充排序失败不影响已经完整拿到的综合排序候选。
    }
  }
  // 定向结果优先去重，避免同一 BV 在裸关键词结果中携带残缺元数据。
  const videos = [...collectionVideos, ...primaryVideos, ...supplementalVideos]
  if (!videos.length) throw new Error("没有获取到 B 站搜索结果")

  const seen = new Set<string>()
  const candidates = videos
    .filter((item) => {
      const key = item.bvid || String(item.aid || "")
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((item) => scoreCandidate(keyword, item))
    .filter((item): item is ScoredCandidate => item !== null)
    .sort((left, right) => right.score - left.score || right.playCount - left.playCount || right.danmakuCount - left.danmakuCount)

  const best = candidates[0]
  if (!best) throw new Error(`没有找到与“${keyword}”高度相关且播放量超过 5 万的合集`)
  const bvid = best.item.bvid?.trim()
  const url = bvid ? `https://www.bilibili.com/video/${bvid}` : plainText(best.item.arcurl)
  if (!url) throw new Error("匹配结果缺少可用的视频链接")
  return {
    title: best.title,
    url,
    author: plainText(best.item.author),
    playCount: best.playCount,
    danmakuCount: best.danmakuCount,
    durationSeconds: best.durationSeconds,
    score: best.score,
  }
}
