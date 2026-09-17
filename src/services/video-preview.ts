import type { VideoDynamicCard } from "../domain/types"
import { pageFetch } from "./page-fetch"

const CACHE_TTL_MS = 10 * 60 * 1000
const previewCache = new Map<string, { expiresAt: number; request: Promise<string> }>()

function videoKey(card: VideoDynamicCard): string {
  return card.videoBvid.trim() || card.videoAid.trim()
}

async function getCid(card: VideoDynamicCard): Promise<number> {
  const query = new URLSearchParams()
  if (card.videoBvid) query.set("bvid", card.videoBvid)
  else if (card.videoAid) query.set("aid", card.videoAid)
  else return 0

  const response = await pageFetch(`https://api.bilibili.com/x/web-interface/view?${query.toString()}`)
  if (!response.ok) return 0
  const payload = await response.json() as { code?: number; data?: { cid?: number; pages?: Array<{ cid?: number }> } }
  if (payload.code !== 0) return 0
  return Number(payload.data?.cid ?? payload.data?.pages?.[0]?.cid ?? 0)
}

async function requestPreviewUrl(card: VideoDynamicCard): Promise<string> {
  const cid = await getCid(card)
  if (!cid) return ""

  const query = new URLSearchParams({ cid: String(cid), qn: "32", fnver: "0", fnval: "1" })
  if (card.videoBvid) query.set("bvid", card.videoBvid)
  else if (card.videoAid) query.set("avid", card.videoAid)
  // The non-WBI endpoint returns the same low-resolution MP4 and avoids WBI
  // anti-bot failures in the content-script request bridge.
  const response = await pageFetch(`https://api.bilibili.com/x/player/playurl?${query.toString()}`)
  if (!response.ok) return ""
  const payload = await response.json() as {
    code?: number
    data?: {
      durl?: Array<{ url?: string; backup_url?: string[] }>
      dash?: { video?: Array<{ baseUrl?: string; base_url?: string; backupUrl?: string[]; backup_url?: string[] }> }
    }
  }
  if (payload.code !== 0) return ""
  const progressive = payload.data?.durl?.[0]
  const dashVideo = payload.data?.dash?.video?.[0]
  return progressive?.url
    || progressive?.backup_url?.[0]
    || dashVideo?.baseUrl
    || dashVideo?.base_url
    || dashVideo?.backupUrl?.[0]
    || dashVideo?.backup_url?.[0]
    || ""
}

export function getVideoPreviewUrl(card: VideoDynamicCard): Promise<string> {
  const key = videoKey(card)
  if (!key) return Promise.resolve("")
  const cached = previewCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.request

  const request = requestPreviewUrl(card).catch(() => "")
  previewCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, request })
  void request.then((url) => {
    if (!url && previewCache.get(key)?.request === request) previewCache.delete(key)
  })
  return request
}
