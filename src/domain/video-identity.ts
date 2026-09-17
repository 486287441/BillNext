import type { VideoDynamicCard } from "./types"

/** 同一视频在推荐、动态和资料库中的 dynamicId 不同，因此优先使用 B 站视频标识。 */
export function getVideoIdentity(card: VideoDynamicCard): string {
  const bvid = card.videoBvid.trim().toLocaleUpperCase()
  if (bvid) return `bvid:${bvid}`
  const aid = card.videoAid.trim()
  return aid ? `aid:${aid}` : `dynamic:${card.dynamicId}`
}

export function isSameVideo(left: VideoDynamicCard, right: VideoDynamicCard): boolean {
  return getVideoIdentity(left) === getVideoIdentity(right)
}
