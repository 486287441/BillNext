import type { DynamicItem, FavoriteFolder, LibraryPageResult, LiveRoomCard, VideoDynamicCard } from "../domain/types"
import type { UpFollowSort } from "../domain/up-filter-types"
import type { SpaceArchiveInput } from "../domain/up-video-bundle"
import { invalidateWbiKeys, signWbiParams } from "./wbi-sign"
import { pageFetch } from "./page-fetch"

export type { UpFollowSort }

interface MomentsApiResponse {
  code?: number
  data?: {
    items?: DynamicItem[]
    offset?: string
    has_more?: boolean
  }
}

export interface MomentsPageResult {
  items: DynamicItem[]
  nextOffset: string
  hasMore: boolean
}

function normalizeBilibiliImage(value: unknown): string {
  const url = typeof value === "string" ? value.trim() : ""
  if (!url) return ""
  return url.startsWith("//") ? `https:${url}` : url
}

/** Returns every followed creator who is currently live for the signed-in account. */
export async function fetchFollowingLiveRooms(): Promise<LiveRoomCard[]> {
  const url = new URL("https://api.live.bilibili.com/xlive/web-ucenter/v1/xfetter/GetWebList")
  url.searchParams.set("page", "1")
  url.searchParams.set("page_size", "100")

  const response = await fetch(url.toString(), { credentials: "include" })
  if (!response.ok) throw new Error(`获取直播列表失败: ${response.status}`)

  const payload = (await response.json()) as {
    code?: number
    message?: string
    data?: { rooms?: Array<Record<string, unknown>> }
  }
  if (payload.code === -101) {
    openBilibiliLogin()
    throw new Error("请先登录 B 站账号")
  }
  if (typeof payload.code === "number" && payload.code !== 0) {
    throw new Error(payload.message || `直播接口错误: ${payload.code}`)
  }

  const rooms = Array.isArray(payload.data?.rooms) ? payload.data.rooms : []
  return rooms.flatMap((room): LiveRoomCard[] => {
    const roomId = String(room.roomid ?? room.room_id ?? "")
    if (!roomId) return []
    const link = typeof room.link === "string" ? room.link : ""
    return [{
      roomId,
      upMid: String(room.uid ?? room.mid ?? ""),
      upName: String(room.uname ?? room.name ?? "正在直播的 UP 主"),
      upAvatar: normalizeBilibiliImage(room.face ?? room.avatar),
      title: String(room.title ?? "正在直播"),
      cover: [room.cover_from_user, room.user_cover, room.system_cover, room.cover, room.keyframe]
        .map(normalizeBilibiliImage)
        .find(Boolean) || "",
      areaName: String(room.area_name ?? room.parent_name ?? "直播"),
      online: Number(room.online ?? room.watched_show_num ?? 0) || 0,
      url: link.startsWith("//") ? `https:${link}` : link.startsWith("http") ? link : `https://live.bilibili.com/${roomId}`,
    }]
  }).sort((a, b) => b.online - a.online)
}

function openBilibiliLogin(): void {
  if (typeof window === "undefined") return
  const loginUrl = new URL("https://passport.bilibili.com/login")
  loginUrl.searchParams.set("gourl", window.location.href)
  window.location.assign(loginUrl.toString())
}

export async function fetchMomentsPage(offset = ""): Promise<MomentsPageResult> {
  const url = new URL("https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all")
  url.searchParams.set("type", "video")
  if (offset) {
    url.searchParams.set("offset", offset)
  }

  const response = await fetch(url.toString(), {
    credentials: "include",
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch moments: ${response.status}`)
  }

  const payload = (await response.json()) as MomentsApiResponse
  if (payload.code === -101) {
    openBilibiliLogin()
    throw new Error("请先登录 B 站账号")
  }
  if (typeof payload.code === "number" && payload.code !== 0) {
    throw new Error(`Moments API error code: ${payload.code}`)
  }

  const items = Array.isArray(payload.data?.items) ? payload.data.items : []
  const nextOffset = typeof payload.data?.offset === "string" ? payload.data.offset : ""
  const hasMore = Boolean(payload.data?.has_more && nextOffset)

  return {
    items,
    nextOffset,
    hasMore,
  }
}

interface CommonApiResponse {
  code: number
  message?: string
}

function getCsrfTokenFromCookie(): string {
  const cookies = document.cookie.split(";")
  for (const segment of cookies) {
    const [key, value] = segment.split("=")
    if (key?.trim() === "bili_jct") {
      return decodeURIComponent((value ?? "").trim())
    }
  }
  return ""
}

export async function saveToWatchLater(card: VideoDynamicCard): Promise<void> {
  const aid = Number(card.videoAid)
  if (!Number.isFinite(aid) || aid <= 0) {
    throw new Error("视频 aid 无效")
  }

  const csrf = getCsrfTokenFromCookie()
  if (!csrf) {
    throw new Error("缺少登录凭证")
  }

  const payload = new URLSearchParams()
  payload.set("aid", String(aid))
  payload.set("csrf", csrf)

  const response = await fetch("https://api.bilibili.com/x/v2/history/toview/add", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: payload.toString(),
  })

  if (!response.ok) {
    throw new Error(`接口请求失败: ${response.status}`)
  }

  const result = (await response.json()) as CommonApiResponse
  if (result.code !== 0) {
    throw new Error(result.message || `接口错误: ${result.code}`)
  }
}

export async function unfollowUp(upMid: string): Promise<void> {
  const mid = Number(upMid)
  if (!Number.isFinite(mid) || mid <= 0) {
    throw new Error("UP 主 mid 无效")
  }

  const csrf = getCsrfTokenFromCookie()
  if (!csrf) {
    throw new Error("缺少登录凭证")
  }

  const payload = new URLSearchParams()
  payload.set("fid", String(mid))
  payload.set("act", "2")
  payload.set("re_src", "11")
  payload.set("jsonp", "jsonp")
  payload.set("csrf", csrf)

  const response = await fetch("https://api.bilibili.com/x/relation/modify", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: payload.toString(),
  })

  if (!response.ok) {
    throw new Error(`接口请求失败: ${response.status}`)
  }

  const result = (await response.json()) as CommonApiResponse
  if (result.code !== 0) {
    throw new Error(result.message || `接口错误: ${result.code}`)
  }
}

export interface LoggedInUser {
  mid: string
  name: string
  face: string
  level: number
  vipActive: boolean
  vipLabel: string
}

export async function fetchLoggedInUser(): Promise<LoggedInUser> {
  const response = await fetch("https://api.bilibili.com/x/web-interface/nav", {
    credentials: "include",
  })
  if (!response.ok) {
    throw new Error(`获取登录信息失败: ${response.status}`)
  }

  const payload = (await response.json()) as {
    code?: number
    message?: string
    data?: {
      isLogin?: boolean
      mid?: number
      uname?: string
      face?: string
      level_info?: { current_level?: number }
      vipStatus?: number
      vipType?: number
      vip?: {
        status?: number
        type?: number
        label?: { text?: string }
      }
      vip_label?: { text?: string }
    }
  }

  if (payload.code !== 0) {
    throw new Error(payload.message || "获取登录信息失败")
  }
  if (!payload.data?.isLogin || !payload.data.mid) {
    throw new Error("请先登录 B 站账号")
  }

  return {
    mid: String(payload.data.mid),
    name: payload.data.uname ?? "",
    face: payload.data.face ?? "",
    level: Math.max(0, Math.min(6, Math.floor(Number(payload.data.level_info?.current_level ?? 0)))),
    vipActive: (payload.data.vip?.status ?? payload.data.vipStatus) === 1,
    vipLabel: payload.data.vip?.label?.text || payload.data.vip_label?.text || ((payload.data.vip?.type ?? payload.data.vipType) === 2 ? "年度大会员" : "大会员"),
  }
}

export interface FollowingUser {
  mid: string
  name: string
  face: string
  sign: string
  followedAt: number
}

export interface FollowingsPageResult {
  list: FollowingUser[]
  total: number
  hasMore: boolean
}

export async function fetchFollowingsPage(
  vmid: string,
  page: number,
  pageSize: number,
  sort: UpFollowSort,
): Promise<FollowingsPageResult> {
  const url = new URL("https://api.bilibili.com/x/relation/followings")
  url.searchParams.set("vmid", vmid)
  url.searchParams.set("pn", String(page))
  url.searchParams.set("ps", String(pageSize))
  url.searchParams.set("order", "desc")
  if (sort === "frequent") {
    url.searchParams.set("order_type", "attention")
  }

  const response = await fetch(url.toString(), {
    credentials: "include",
  })
  if (!response.ok) {
    throw new Error(`获取关注列表失败: ${response.status}`)
  }

  const payload = (await response.json()) as {
    code?: number
    message?: string
    data?: {
      list?: Array<{
        mid?: number
        uname?: string
        face?: string
        sign?: string
        mtime?: number
      }>
      total?: number
    }
  }

  if (payload.code !== 0) {
    throw new Error(payload.message || `获取关注列表失败: ${payload.code}`)
  }

  const rawList = Array.isArray(payload.data?.list) ? payload.data.list : []
  const total = typeof payload.data?.total === "number" ? payload.data.total : rawList.length
  const list: FollowingUser[] = rawList
    .map((item) => {
      const mid = item.mid
      if (typeof mid !== "number" || mid <= 0) {
        return null
      }
      return {
        mid: String(mid),
        name: item.uname ?? "",
        face: item.face ?? "",
        sign: item.sign ?? "",
        followedAt: typeof item.mtime === "number" ? item.mtime : 0,
      }
    })
    .filter((item): item is FollowingUser => item !== null)

  return {
    list,
    total,
    hasMore: page * pageSize < total,
  }
}

export async function fetchUserFollowerCount(mid: string): Promise<number> {
  const url = new URL("https://api.bilibili.com/x/relation/stat")
  url.searchParams.set("vmid", mid)

  const response = await fetch(url.toString(), {
    credentials: "include",
  })
  if (!response.ok) {
    throw new Error(`获取粉丝数失败: ${response.status}`)
  }

  const payload = (await response.json()) as {
    code?: number
    data?: {
      follower?: number
    }
  }

  if (payload.code !== 0) {
    return 0
  }

  const follower = payload.data?.follower
  return typeof follower === "number" && follower > 0 ? follower : 0
}

function normalizeDurationText(length: unknown, durationText: unknown): string {
  if (typeof durationText === "string" && durationText.trim()) {
    return durationText.trim()
  }
  const seconds = typeof length === "number" ? length : Number(length)
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return ""
  }
  const total = Math.floor(seconds)
  const minute = Math.floor(total / 60)
  const second = total % 60
  return `${minute}:${String(second).padStart(2, "0")}`
}

function mapSpaceArchive(item: Record<string, unknown>): SpaceArchiveInput | null {
  const bvid = typeof item.bvid === "string" ? item.bvid : ""
  const aidRaw = item.aid
  const aid = typeof aidRaw === "number" || typeof aidRaw === "string" ? String(aidRaw) : ""
  if (!bvid && !aid) {
    return null
  }

  const title = typeof item.title === "string" ? item.title : ""
  const pic = typeof item.pic === "string" ? item.pic : ""
  const created = typeof item.created === "number" ? item.created : Number(item.pubdate)
  const stat = item.stat && typeof item.stat === "object" ? (item.stat as Record<string, unknown>) : {}
  const playRaw = item.play ?? stat.view ?? stat.play ?? 0
  const play = typeof playRaw === "number" ? playRaw : Number(playRaw)
  const danmakuRaw = item.video_review ?? stat.danmaku ?? 0
  const danmaku = typeof danmakuRaw === "number" ? danmakuRaw : Number(danmakuRaw)

  return {
    bvid,
    aid,
    title,
    cover: pic,
    durationText: normalizeDurationText(item.length, item.duration),
    playCount: Number.isFinite(play) && play > 0 ? Math.floor(play) : 0,
    danmakuCount: Number.isFinite(danmaku) && danmaku > 0 ? Math.floor(danmaku) : 0,
    publishAt: Number.isFinite(created) && created > 0 ? Math.floor(created) : 0,
  }
}

function extractSpaceVlist(payload: {
  data?: {
    list?: Array<Record<string, unknown>> | { vlist?: Array<Record<string, unknown>> }
  }
}): Array<Record<string, unknown>> {
  const list = payload.data?.list
  if (Array.isArray(list)) {
    return list
  }
  if (list && typeof list === "object" && Array.isArray(list.vlist)) {
    return list.vlist
  }
  return []
}

function parseSpaceArchivePayload(payload: {
  code?: number
  message?: string
  data?: {
    list?: Array<Record<string, unknown>> | { vlist?: Array<Record<string, unknown>> }
  }
}): SpaceArchiveInput[] {
  if (payload.code !== 0) {
    throw new Error(payload.message || `获取投稿失败: ${payload.code}`)
  }

  return extractSpaceVlist(payload)
    .map((item) => mapSpaceArchive(item))
    .filter((item): item is SpaceArchiveInput => item !== null)
}

async function fetchSpaceArchivesPage(
  mid: string,
  page: number,
  pageSize: number,
  order: "pubdate" | "click" = "pubdate",
): Promise<SpaceArchiveInput[]> {
  const params = {
    mid,
    pn: page,
    ps: pageSize,
    tid: 0,
    order,
    platform: "web",
    web_location: 1550101,
  }

  async function requestWithWbi(retry: boolean): Promise<SpaceArchiveInput[]> {
    const query = await signWbiParams(params)
    const response = await fetch(`https://api.bilibili.com/x/space/wbi/arc/search?${query.toString()}`, {
      credentials: "include",
      headers: {
        Referer: `https://space.bilibili.com/${mid}`,
      },
    })
    if (!response.ok) {
      throw new Error(`获取投稿失败: ${response.status}`)
    }

    const payload = (await response.json()) as {
      code?: number
      message?: string
      data?: {
        list?: Array<Record<string, unknown>> | { vlist?: Array<Record<string, unknown>> }
      }
    }

    // -352 是风控，不应立刻重试放大请求；-403 才刷新一次可能过期的 WBI 密钥。
    if (payload.code === -403 && retry) {
      invalidateWbiKeys()
      return requestWithWbi(false)
    }

    return parseSpaceArchivePayload(payload)
  }

  return requestWithWbi(true)
}

export async function fetchFollowingRelations(upMids: string[]): Promise<Record<string, boolean>> {
  const mids = [...new Set(upMids.map((mid) => mid.trim()).filter((mid) => /^\d+$/.test(mid) && Number(mid) > 0))]
  if (mids.length === 0) return {}
  const url = new URL("https://api.bilibili.com/x/relation/relations")
  url.searchParams.set("fids", mids.slice(0, 50).join(","))
  const response = await fetch(url.toString(), { credentials: "include" })
  if (!response.ok) throw new Error(`获取关注状态失败: ${response.status}`)
  const payload = (await response.json()) as {
    code?: number
    message?: string
    data?: Record<string, { attribute?: number }>
  }
  if (payload.code !== 0) throw new Error(payload.message || `获取关注状态失败: ${payload.code}`)
  const result: Record<string, boolean> = {}
  for (const mid of mids) {
    const attribute = Number(payload.data?.[mid]?.attribute ?? 0)
    result[mid] = (attribute & 2) === 2
  }
  return result
}

function formatDurationText(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return ""
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = total % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${minutes}:${String(rest).padStart(2, "0")}`
}

function libraryCard(input: {
  aid?: number | string
  bvid?: string
  title?: string
  cover?: string
  duration?: number
  watchedSeconds?: number
  play?: number
  danmaku?: number
  upMid?: number | string
  upName?: string
  upAvatar?: string
  publishAt?: number
  url?: string
  keyPrefix: string
}): VideoDynamicCard {
  const aid = String(input.aid ?? "")
  const bvid = input.bvid ?? ""
  const duration = Number(input.duration ?? 0)
  const rawWatchedSeconds = input.watchedSeconds
  const watchedSeconds = rawWatchedSeconds === undefined
    ? undefined
    : rawWatchedSeconds < 0
      ? duration
      : Math.min(Number(rawWatchedSeconds) || 0, duration > 0 ? duration : Number(rawWatchedSeconds) || 0)
  return {
    dynamicId: `${input.keyPrefix}:${bvid || aid}`,
    videoAid: aid,
    videoBvid: bvid,
    title: input.title || "未命名视频",
    cover: input.cover || "",
    durationText: formatDurationText(duration),
    durationSeconds: duration,
    watchedSeconds,
    playCount: Number(input.play ?? 0),
    danmakuCount: Number(input.danmaku ?? 0),
    upMid: String(input.upMid ?? ""),
    upName: input.upName || "未知 UP",
    upAvatar: input.upAvatar || "",
    publishAt: Number(input.publishAt ?? 0),
    url: input.url,
  }
}

async function readApiJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" })
  if (!response.ok) throw new Error(`请求失败: ${response.status}`)
  const payload = await response.json() as { code?: number; message?: string }
  if (typeof payload.code === "number" && payload.code !== 0) {
    throw new Error(payload.message || `接口错误: ${payload.code}`)
  }
  return payload as T
}

export async function fetchFavoriteFolders(): Promise<FavoriteFolder[]> {
  const user = await fetchLoggedInUser()
  const url = new URL("https://api.bilibili.com/x/v3/fav/folder/created/list-all")
  url.searchParams.set("up_mid", user.mid)
  const payload = await readApiJson<{
    data?: { list?: Array<{ id?: number; title?: string; media_count?: number }> }
  }>(url.toString())
  return (payload.data?.list ?? [])
    .filter((folder) => Number(folder.id) > 0)
    .map((folder) => ({
      id: Number(folder.id),
      title: folder.title || "未命名收藏夹",
      mediaCount: Number(folder.media_count ?? 0),
    }))
}

export async function fetchFavoriteVideos(mediaId: number, page = 1): Promise<LibraryPageResult> {
  const url = new URL("https://api.bilibili.com/x/v3/fav/resource/list")
  url.searchParams.set("media_id", String(mediaId))
  url.searchParams.set("pn", String(page))
  url.searchParams.set("ps", "30")
  url.searchParams.set("order", "mtime")
  url.searchParams.set("platform", "web")
  const payload = await readApiJson<{
    data?: {
      medias?: Array<{
        id?: number
        bvid?: string
        bv_id?: string
        title?: string
        cover?: string
        duration?: number
        pubtime?: number
        upper?: { mid?: number; name?: string; face?: string }
        cnt_info?: { play?: number; danmaku?: number }
      }>
      has_more?: boolean
    }
  }>(url.toString())
  return {
    cards: (payload.data?.medias ?? []).map((item) => libraryCard({
      aid: item.id,
      bvid: item.bvid || item.bv_id,
      title: item.title,
      cover: item.cover,
      duration: item.duration,
      play: item.cnt_info?.play,
      danmaku: item.cnt_info?.danmaku,
      upMid: item.upper?.mid,
      upName: item.upper?.name,
      upAvatar: item.upper?.face,
      publishAt: item.pubtime,
      keyPrefix: `favorite:${mediaId}`,
    })),
    hasMore: Boolean(payload.data?.has_more),
  }
}

export async function fetchWatchLaterVideos(): Promise<LibraryPageResult> {
  const payload = await readApiJson<{
    data?: {
      list?: Array<{
        aid?: number
        bvid?: string
        title?: string
        pic?: string
        duration?: number
        pubdate?: number
        owner?: { mid?: number; name?: string; face?: string }
        stat?: { view?: number; danmaku?: number }
      }>
    }
  }>("https://api.bilibili.com/x/v2/history/toview")
  return {
    cards: (payload.data?.list ?? []).map((item) => libraryCard({
      aid: item.aid,
      bvid: item.bvid,
      title: item.title,
      cover: item.pic,
      duration: item.duration,
      play: item.stat?.view,
      danmaku: item.stat?.danmaku,
      upMid: item.owner?.mid,
      upName: item.owner?.name,
      upAvatar: item.owner?.face,
      publishAt: item.pubdate,
      keyPrefix: "watchlater",
    })),
    hasMore: false,
  }
}

interface HistoryVideoDetails {
  view: number
  danmaku: number
  upAvatar: string
}

async function fetchHistoryVideoDetails(bvid: string, aid: number): Promise<HistoryVideoDetails> {
  const url = new URL("https://api.bilibili.com/x/web-interface/view")
  if (bvid) url.searchParams.set("bvid", bvid)
  else if (aid > 0) url.searchParams.set("aid", String(aid))
  else return { view: 0, danmaku: 0, upAvatar: "" }
  try {
    const response = await pageFetch(url.toString(), { headers: { Referer: "https://www.bilibili.com/" } })
    if (!response.ok) throw new Error(`视频详情请求失败: ${response.status}`)
    const payload = await response.json() as {
      code?: number
      data?: {
        owner?: { face?: string }
        stat?: { view?: number; danmaku?: number }
      }
    }
    if (payload.code !== 0) throw new Error(`视频详情接口错误: ${payload.code}`)
    return {
      view: Number(payload.data?.stat?.view ?? 0),
      danmaku: Number(payload.data?.stat?.danmaku ?? 0),
      upAvatar: payload.data?.owner?.face ?? "",
    }
  } catch {
    // A deleted or unavailable video must not make the whole history page fail.
    return { view: 0, danmaku: 0, upAvatar: "" }
  }
}

async function enrichHistoryDetails(cards: VideoDynamicCard[]): Promise<void> {
  let nextIndex = 0
  const concurrency = Math.min(6, cards.length)
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (nextIndex < cards.length) {
      const card = cards[nextIndex++]
      const details = await fetchHistoryVideoDetails(card.videoBvid, Number(card.videoAid))
      if (details.view > 0) card.playCount = details.view
      if (details.danmaku > 0) card.danmakuCount = details.danmaku
      if (details.upAvatar) card.upAvatar = details.upAvatar
    }
  }))
}

export async function fetchHistoryVideos(max = 0, viewAt = 0, business = ""): Promise<LibraryPageResult> {
  const url = new URL("https://api.bilibili.com/x/web-interface/history/cursor")
  url.searchParams.set("max", String(max))
  url.searchParams.set("view_at", String(viewAt))
  url.searchParams.set("business", business)
  const payload = await readApiJson<{
    data?: {
      list?: Array<{
        title?: string
        cover?: string
        author_name?: string
        author_mid?: number
        author_face?: string
        duration?: number
        progress?: number
        view_at?: number
        uri?: string
        stat?: { view?: number; danmaku?: number }
        history?: { oid?: number; bvid?: string; business?: string }
      }>
      cursor?: { max?: number; view_at?: number; business?: string; ps?: number }
    }
  }>(url.toString())
  const items = payload.data?.list ?? []
  const cards = items.map((item) => libraryCard({
    aid: item.history?.oid,
    bvid: item.history?.bvid,
    title: item.title,
    cover: item.cover,
    duration: item.duration,
    watchedSeconds: item.progress,
    upMid: item.author_mid,
    upName: item.author_name,
    upAvatar: item.author_face,
    play: item.stat?.view,
    danmaku: item.stat?.danmaku,
    publishAt: item.view_at,
    url: item.uri,
    keyPrefix: `history:${item.history?.business || "video"}`,
  }))
  await enrichHistoryDetails(cards)
  const cursor = payload.data?.cursor
  const nextMax = Number(cursor?.max ?? 0)
  const nextViewAt = Number(cursor?.view_at ?? 0)
  const nextBusiness = cursor?.business ?? ""
  const cursorAdvanced = nextMax !== max || nextViewAt !== viewAt || nextBusiness !== business
  return {
    cards,
    hasMore: items.length > 0 && cursorAdvanced && Number(cursor?.ps ?? items.length) > 0,
    nextMax,
    nextViewAt,
    nextBusiness,
  }
}

export async function addVideoToDefaultFavorite(card: VideoDynamicCard): Promise<void> {
  const aid = Number(card.videoAid)
  if (!Number.isFinite(aid) || aid <= 0) {
    throw new Error("视频 aid 无效")
  }

  const csrf = getCsrfTokenFromCookie()
  if (!csrf) {
    throw new Error("请先登录 B 站")
  }

  const user = await fetchLoggedInUser()
  const foldersResponse = await fetch(
    `https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${encodeURIComponent(user.mid)}&rid=${aid}&type=2`,
    { credentials: "include" },
  )
  if (!foldersResponse.ok) {
    throw new Error(`获取收藏夹失败: ${foldersResponse.status}`)
  }
  const foldersPayload = (await foldersResponse.json()) as {
    code?: number
    message?: string
    data?: { list?: Array<{ id?: number; title?: string; fav_state?: number }> }
  }
  if (foldersPayload.code !== 0) {
    throw new Error(foldersPayload.message || `获取收藏夹失败: ${foldersPayload.code}`)
  }

  const folders = foldersPayload.data?.list ?? []
  if (folders.some((folder) => folder.fav_state === 1)) {
    return
  }
  const defaultFolder = folders.find((folder) => typeof folder.id === "number" && folder.id > 0)
  if (!defaultFolder?.id) {
    throw new Error("没有可用的收藏夹")
  }

  const body = new URLSearchParams()
  body.set("rid", String(aid))
  body.set("type", "2")
  body.set("add_media_ids", String(defaultFolder.id))
  body.set("del_media_ids", "")
  body.set("csrf", csrf)

  const response = await fetch("https://api.bilibili.com/x/v3/fav/resource/deal", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: body.toString(),
  })
  if (!response.ok) {
    throw new Error(`收藏接口请求失败: ${response.status}`)
  }
  const result = (await response.json()) as CommonApiResponse
  if (result.code !== 0) {
    throw new Error(result.message || `收藏接口错误: ${result.code}`)
  }
}

export async function removeVideoFromFavorite(card: VideoDynamicCard, mediaId: number): Promise<void> {
  const aid = Number(card.videoAid)
  if (!Number.isFinite(aid) || aid <= 0 || !Number.isFinite(mediaId) || mediaId <= 0) {
    throw new Error("收藏信息无效")
  }
  const csrf = getCsrfTokenFromCookie()
  if (!csrf) throw new Error("请先登录 B 站")
  const body = new URLSearchParams()
  body.set("media_id", String(mediaId))
  body.set("resources", `${aid}:2`)
  body.set("platform", "web")
  body.set("csrf", csrf)
  const response = await fetch("https://api.bilibili.com/x/v3/fav/resource/batch-del", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: body.toString(),
  })
  if (!response.ok) throw new Error(`取消收藏失败: ${response.status}`)
  const result = (await response.json()) as CommonApiResponse
  if (result.code !== 0) throw new Error(result.message || `取消收藏失败: ${result.code}`)
}

export async function removeVideoFromWatchLater(card: VideoDynamicCard): Promise<void> {
  const aid = Number(card.videoAid)
  if (!Number.isFinite(aid) || aid <= 0) throw new Error("视频 aid 无效")
  const csrf = getCsrfTokenFromCookie()
  if (!csrf) throw new Error("请先登录 B 站")
  const body = new URLSearchParams()
  body.set("aid", String(aid))
  body.set("csrf", csrf)
  const response = await fetch("https://api.bilibili.com/x/v2/history/toview/del", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: body.toString(),
  })
  if (!response.ok) throw new Error(`移出稍后再看失败: ${response.status}`)
  const result = (await response.json()) as CommonApiResponse
  if (result.code !== 0) throw new Error(result.message || `移出稍后再看失败: ${result.code}`)
}

/** 通过 B 站 PC 首页官方负反馈通道提交“内容不感兴趣”。 */
export async function submitOfficialDislike(card: VideoDynamicCard): Promise<void> {
  const aid = Number(card.videoAid)
  if (!Number.isFinite(aid) || aid <= 0) {
    throw new Error("视频 aid 无效")
  }

  const body = new URLSearchParams()
  body.set("app_id", "100")
  body.set("platform", "5")
  body.set("from_spmid", "")
  body.set("spmid", "333.1007.0.0")
  body.set("goto", card.recommendationGoto || "av")
  body.set("id", String(aid))
  body.set("mid", card.upMid || "0")
  body.set("track_id", card.recommendationTrackId || "")
  body.set("feedback_page", "1")
  body.set("reason_id", "1")

  const response = await fetch("https://api.bilibili.com/x/web-interface/feedback/dislike", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: body.toString(),
  })
  if (!response.ok) {
    throw new Error(`不感兴趣接口请求失败: ${response.status}`)
  }
  const result = (await response.json()) as CommonApiResponse
  if (result.code !== 0) {
    throw new Error(result.message || `不感兴趣接口错误: ${result.code}`)
  }
}

export interface HomeFeedPageResult {
  cards: VideoDynamicCard[]
  hasMore: boolean
}

interface HomeArchiveRow {
  aid?: number | string
  id?: number | string
  bvid?: string
  pic?: string
  title?: string
  duration?: number
  pubdate?: number
  owner?: { mid?: number | string; name?: string; face?: string }
  stat?: { view?: number; like?: number; danmaku?: number }
  rcmd_reason?: { content?: string }
  goto?: string
  track_id?: string
}

function mapHomeArchive(item: HomeArchiveRow, source: string, rank?: number): VideoDynamicCard | null {
  const aidValue = item.aid ?? item.id
  const aid = aidValue === undefined ? "" : String(aidValue)
  const bvid = typeof item.bvid === "string" ? item.bvid : ""
  if (!aid && !bvid) return null
  const durationSeconds = Number.isFinite(item.duration) ? Math.max(0, Math.floor(item.duration ?? 0)) : 0
  return {
    dynamicId: `${source}:${bvid || aid}`,
    videoAid: aid,
    videoBvid: bvid,
    title: typeof item.title === "string" ? item.title : "未命名视频",
    cover: typeof item.pic === "string" ? item.pic : "",
    durationText: formatVideoDuration(durationSeconds),
    durationSeconds,
    playCount: Number.isFinite(item.stat?.view) ? Math.max(0, Math.floor(item.stat?.view ?? 0)) : 0,
    likeCount: Number.isFinite(item.stat?.like) ? Math.max(0, Math.floor(item.stat?.like ?? 0)) : 0,
    danmakuCount: Number.isFinite(item.stat?.danmaku) ? Math.max(0, Math.floor(item.stat?.danmaku ?? 0)) : 0,
    upMid: item.owner?.mid === undefined ? "" : String(item.owner.mid),
    upName: typeof item.owner?.name === "string" ? item.owner.name : "未知 UP",
    upAvatar: typeof item.owner?.face === "string" ? item.owner.face : "",
    publishAt: Number.isFinite(item.pubdate) ? Math.floor(item.pubdate ?? Date.now() / 1000) : Math.floor(Date.now() / 1000),
    rank,
    tag: typeof item.rcmd_reason?.content === "string" ? item.rcmd_reason.content : "",
    recommendationGoto: typeof item.goto === "string" ? item.goto : undefined,
    recommendationTrackId: typeof item.track_id === "string" ? item.track_id : undefined,
  }
}

export async function fetchPopularVideosPage(page: number, pageSize = 30): Promise<HomeFeedPageResult> {
  const url = new URL("https://api.bilibili.com/x/web-interface/popular")
  url.searchParams.set("pn", String(page))
  url.searchParams.set("ps", String(pageSize))
  const response = await pageFetch(url.toString(), { headers: { Referer: "https://www.bilibili.com/" } })
  if (!response.ok) throw new Error(`获取热门视频失败：${response.status}`)
  const payload = (await response.json()) as { code?: number; message?: string; data?: { list?: HomeArchiveRow[]; no_more?: boolean } }
  if (payload.code !== 0) throw new Error(payload.message || `热门视频接口错误：${payload.code}`)
  const cards = (payload.data?.list ?? []).map((item) => mapHomeArchive(item, "popular")).filter((item): item is VideoDynamicCard => item !== null)
  return { cards, hasMore: payload.data?.no_more !== true && cards.length > 0 }
}

export async function fetchRankingVideos(): Promise<HomeFeedPageResult> {
  const url = new URL("https://api.bilibili.com/x/web-interface/ranking/v2")
  url.searchParams.set("rid", "0")
  url.searchParams.set("type", "all")
  const response = await pageFetch(url.toString(), { headers: { Referer: "https://www.bilibili.com/" } })
  if (!response.ok) throw new Error(`获取排行榜失败：${response.status}`)
  const payload = (await response.json()) as { code?: number; message?: string; data?: { list?: HomeArchiveRow[] } }
  if (payload.code !== 0) throw new Error(payload.message || `排行榜接口错误：${payload.code}`)
  const cards = (payload.data?.list ?? []).map((item, index) => mapHomeArchive(item, "ranking", index + 1)).filter((item): item is VideoDynamicCard => item !== null)
  return { cards, hasMore: false }
}

function formatVideoDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return ""
  }
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = total % 60
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
}

/** B 站首页使用的网页推荐流，与 BewlyBewly 的 web 推荐模式保持一致。 */
export async function fetchHomeFeedPage(freshIndex: number, pageSize = 30): Promise<HomeFeedPageResult> {
  const url = new URL("https://api.bilibili.com/x/web-interface/index/top/feed/rcmd")
  url.searchParams.set("fresh_idx", String(freshIndex))
  url.searchParams.set("feed_version", "V2")
  url.searchParams.set("fresh_type", "4")
  url.searchParams.set("ps", String(pageSize))
  url.searchParams.set("plat", "1")

  const response = await fetch(url.toString(), { credentials: "include" })
  if (!response.ok) {
    throw new Error(`获取首页推荐失败：${response.status}`)
  }

  const payload = (await response.json()) as {
    code?: number
    message?: string
    data?: {
      item?: Array<{
        id?: number | string
        bvid?: string
        pic?: string
        title?: string
        duration?: number
        pubdate?: number
        owner?: { mid?: number | string; name?: string; face?: string }
        stat?: { view?: number; like?: number; danmaku?: number }
        goto?: string
        track_id?: string
      }>
    }
  }
  if (payload.code !== 0) {
    throw new Error(payload.message || `首页推荐接口错误：${payload.code}`)
  }

  const rows = Array.isArray(payload.data?.item) ? payload.data.item : []
  const cards = rows.map((item) => mapHomeArchive(item, "home")).filter((item): item is VideoDynamicCard => item !== null)

  return { cards, hasMore: cards.length > 0 }
}

export async function fetchUpCreatorBundle(mid: string): Promise<{
  recentArchives: SpaceArchiveInput[]
  mostPlayedArchive?: SpaceArchiveInput
}> {
  // 两种排序无法在同一次空间请求中得到。请求量保持为固定两次，调用方负责排队与缓存。
  // 多取一条仅用于“想看的”与最新视频重复时补足五张卡片。
  const recentArchives = await fetchSpaceArchivesPage(mid, 1, 4, "pubdate")
  await new Promise((resolve) => window.setTimeout(resolve, 1000))
  const mostPlayedArchives = await fetchSpaceArchivesPage(mid, 1, 1, "click")
  return {
    recentArchives,
    mostPlayedArchive: mostPlayedArchives[0],
  }
}

export async function followUp(upMid: string): Promise<void> {
  const mid = Number(upMid)
  if (!Number.isFinite(mid) || mid <= 0) {
    throw new Error("UP 主 mid 无效")
  }

  const csrf = getCsrfTokenFromCookie()
  if (!csrf) {
    throw new Error("缺少登录凭证")
  }

  const payload = new URLSearchParams()
  payload.set("fid", String(mid))
  payload.set("act", "1")
  payload.set("re_src", "11")
  payload.set("jsonp", "jsonp")
  payload.set("csrf", csrf)

  const response = await fetch("https://api.bilibili.com/x/relation/modify", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: payload.toString(),
  })

  if (!response.ok) {
    throw new Error(`接口请求失败: ${response.status}`)
  }

  const result = (await response.json()) as CommonApiResponse
  if (result.code !== 0) {
    throw new Error(result.message || `接口错误: ${result.code}`)
  }
}
