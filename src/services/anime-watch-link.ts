import { pageFetch } from "./page-fetch"
import { findBestAnimeWatchLink } from "./anime-watch-match"

type Availability = "available" | "missing" | "unknown"

export async function checkAnimeWatchLink(raw: string, request: typeof pageFetch = pageFetch): Promise<Availability> {
  const url = new URL(raw)
  if (!/^https?:$/.test(url.protocol)) throw new Error("观看链接只支持 http 或 https")
  const video = /(?:^|\.)bilibili\.com$/i.test(url.hostname)
    ? url.pathname.match(/^\/video\/(BV[\da-z]+|av\d+)(?:\/|$)/i) : null
  try {
    if (video) {
      const id = video[1]
      const query = /^av/i.test(id) ? `aid=${id.slice(2)}` : `bvid=${encodeURIComponent(id)}`
      const response = await request(`https://api.bilibili.com/x/web-interface/view?${query}`)
      if (!response.ok) return "unknown"
      const payload = await response.json()
      if (payload.code === 0 && payload.data?.bvid) return "available"
      // 风控、登录限制和服务异常不能当成视频已删除。
      if (payload.code === -404 || payload.code === 62002) return "missing"
      return "unknown"
    }
    const response = await request(url.toString())
    if (response.status === 404 || response.status === 410) return "missing"
    // 普通网页的 200 不代表视频可用，无法可靠判断时保留原链接。
    return "unknown"
  } catch {
    return "unknown"
  }
}

export async function resolveAnimeWatchLink(
  sourceUrl: string,
  title: string,
  onRematch: () => void,
  check = checkAnimeWatchLink,
  match = findBestAnimeWatchLink,
): Promise<{ url: string; replaced: boolean; verified: boolean }> {
  const state = await check(sourceUrl)
  if (state !== "missing") return { url: sourceUrl, replaced: false, verified: state === "available" }
  onRematch()
  const result = await match(title, async (url) => url !== sourceUrl && await check(url) === "available")
  return { url: result.url, replaced: true, verified: true }
}
