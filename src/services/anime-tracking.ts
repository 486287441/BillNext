import type { AnimeAirStatus, AnimeTrackingItem } from "../domain/anime-tracking"

declare const chrome: any

interface BangumiImages { large?: string; common?: string; medium?: string; grid?: string }
interface BangumiSubject {
  id: number
  type: number
  name: string
  name_cn: string
  summary?: string
  date?: string
  eps?: number
  total_episodes?: number
  images?: BangumiImages | null
}
interface BangumiEpisode {
  id: number
  type: number
  name: string
  name_cn: string
  sort: number
  ep?: number
  airdate: string
}

function bangumiRequest<T>(path: string, init?: { method?: "GET" | "POST"; body?: unknown }): Promise<T> {
  return new Promise((resolve, reject) => {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      reject(new Error("扩展后台不可用，无法查询 Bangumi"))
      return
    }
    chrome.runtime.sendMessage({ type: "bangumi:request", path, init }, (response: { ok?: boolean; data?: T; error?: string } | undefined) => {
      const runtimeError = chrome.runtime.lastError
      if (runtimeError) {
        reject(new Error(runtimeError.message))
        return
      }
      if (!response?.ok) {
        reject(new Error(response?.error || "Bangumi 查询失败"))
        return
      }
      resolve(response.data as T)
    })
  })
}

function validateWatchUrl(input: string): string {
  const text = input.trim()
  if (!text) throw new Error("请输入观看合集链接")
  let url: URL
  try { url = new URL(text) } catch { throw new Error("请输入完整的 http 或 https 链接") }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("观看链接只支持 http 或 https")
  return url.toString()
}

function localDateText(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function episodeLabel(episode: BangumiEpisode | undefined, airedCount: number): string {
  if (!episode) return airedCount > 0 ? `已更新 ${airedCount} 集` : "尚未开播"
  const number = Number(episode.ep ?? episode.sort)
  const title = (episode.name_cn || episode.name).trim()
  return `第 ${Number.isFinite(number) ? number : airedCount} 集${title ? ` · ${title}` : ""}`
}

async function fetchBangumiSubject(subjectId: number): Promise<{ subject: BangumiSubject; episodes: BangumiEpisode[] }> {
  const [subject, episodePage] = await Promise.all([
    bangumiRequest<BangumiSubject>(`/v0/subjects/${subjectId}`),
    bangumiRequest<{ data?: BangumiEpisode[] }>(`/v0/episodes?subject_id=${subjectId}&type=0&limit=200&offset=0`),
  ])
  return { subject, episodes: Array.isArray(episodePage.data) ? episodePage.data : [] }
}

async function searchBangumiSubject(title: string): Promise<BangumiSubject> {
  const query = title.trim()
  if (!query) throw new Error("请输入番剧名称")
  const result = await bangumiRequest<{ data?: BangumiSubject[] }>("/v0/search/subjects?limit=10&offset=0", {
    method: "POST",
    body: { keyword: query, sort: "match", filter: { type: [2], nsfw: false } },
  })
  const subjects = (result.data ?? []).filter((item) => item.type === 2)
  if (subjects.length === 0) throw new Error(`Bangumi 没有找到“${query}”，请检查名称后重试`)
  const normalizedQuery = normalizeTitle(query)
  const ranked = subjects
    .map((subject) => ({ subject, score: Math.max(titleSimilarity(normalizedQuery, normalizeTitle(subject.name_cn)), titleSimilarity(normalizedQuery, normalizeTitle(subject.name))) }))
    .sort((left, right) => right.score - left.score)
  if (!ranked[0] || ranked[0].score < 0.34) {
    throw new Error(`没有可靠匹配到“${query}”，请尝试填写更完整的正式名称`)
  }
  return ranked[0].subject
}

function normalizeTitle(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "")
}

function titleSimilarity(left: string, right: string): number {
  if (!left || !right) return 0
  if (left === right) return 1
  if (left.includes(right) || right.includes(left)) return Math.min(left.length, right.length) / Math.max(left.length, right.length) + 0.25
  const leftPairs = new Set(Array.from({ length: Math.max(0, left.length - 1) }, (_, index) => left.slice(index, index + 2)))
  const rightPairs = new Set(Array.from({ length: Math.max(0, right.length - 1) }, (_, index) => right.slice(index, index + 2)))
  if (leftPairs.size === 0 || rightPairs.size === 0) return 0
  let overlap = 0
  for (const pair of leftPairs) if (rightPairs.has(pair)) overlap += 1
  return 2 * overlap / (leftPairs.size + rightPairs.size)
}

function buildTrackingItem(
  queryTitle: string,
  sourceUrl: string,
  subject: BangumiSubject,
  episodes: BangumiEpisode[],
  seenEpisodeKey = "",
): AnimeTrackingItem {
  const today = localDateText()
  const mainEpisodes = episodes
    .filter((episode) => episode.type === 0)
    .sort((left, right) => Number(left.ep ?? left.sort) - Number(right.ep ?? right.sort))
  const aired = mainEpisodes.filter((episode) => /^\d{4}-\d{2}-\d{2}$/.test(episode.airdate) && episode.airdate <= today)
  const future = mainEpisodes.filter((episode) => /^\d{4}-\d{2}-\d{2}$/.test(episode.airdate) && episode.airdate > today)
  const latest = aired.at(-1)
  const next = future[0]
  const declaredEpisodes = Math.max(0, Number(subject.eps) || 0)
  const expectedEpisodes = Math.max(0, declaredEpisodes || Number(subject.total_episodes) || mainEpisodes.length || 0)
  let airStatus: AnimeAirStatus = "unknown"
  if (subject.date && subject.date > today) airStatus = "upcoming"
  else if (declaredEpisodes > 0 && aired.length >= declaredEpisodes) airStatus = "completed"
  else if (aired.length > 0 || next) airStatus = "airing"
  const latestEpisodeKey = latest ? `bgm-ep:${latest.id}` : `bgm-subject:${subject.id}:waiting`
  const cover = subject.images?.large || subject.images?.common || subject.images?.medium || ""
  return {
    id: `bangumi:${subject.id}`,
    kind: "bangumi",
    lookupId: String(subject.id),
    sourceUrl,
    title: subject.name_cn || subject.name || queryTitle,
    cover: cover.replace(/^http:/, "https:"),
    author: "Bangumi 番组计划",
    authorUrl: `https://bgm.tv/subject/${subject.id}`,
    latestEpisodeTitle: episodeLabel(latest, aired.length),
    latestEpisodeUrl: sourceUrl,
    latestEpisodeKey,
    episodeCount: expectedEpisodes,
    updatedAt: latest?.airdate ? Math.floor(new Date(`${latest.airdate}T00:00:00`).getTime() / 1000) : 0,
    checkedAt: Date.now(),
    seenEpisodeKey: seenEpisodeKey || latestEpisodeKey,
    queryTitle,
    bangumiSubjectId: subject.id,
    totalEpisodes: expectedEpisodes,
    airedEpisodes: aired.length,
    airStatus,
    airDate: subject.date || "",
    nextEpisodeDate: next?.airdate || "",
    summary: (subject.summary || "").trim(),
  }
}

export async function fetchAnimeByName(title: string, watchUrl: string): Promise<AnimeTrackingItem> {
  const sourceUrl = validateWatchUrl(watchUrl)
  const matched = await searchBangumiSubject(title)
  const { subject, episodes } = await fetchBangumiSubject(matched.id)
  const item = buildTrackingItem(title.trim(), sourceUrl, subject, episodes)
  item.cover = await cacheAnimeCover(item.cover)
  return item
}

export async function editTrackedAnime(item: AnimeTrackingItem, title: string, watchUrl: string): Promise<AnimeTrackingItem> {
  const name = title.trim()
  if (!name) throw new Error("请输入番剧名称")
  return { ...item, title: name, queryTitle: name, sourceUrl: validateWatchUrl(watchUrl), latestEpisodeUrl: validateWatchUrl(watchUrl) }
}

export function cacheAnimeCover(url: string): Promise<string> {
  if (!url || url.startsWith("data:image/")) return Promise.resolve(url)
  url = url.replace(/^http:/, "https:")
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "bangumi:cache-cover", url }, (response: { ok?: boolean; data?: string; error?: string } | undefined) => {
      const error = chrome.runtime.lastError
      if (error || !response?.ok) {
        reject(new Error(error?.message || response?.error || "封面缓存失败，请检查网络后重试"))
        return
      }
      resolve(response.data || "")
    })
  })
}
