export interface DynamicItem {
  id_str?: string
  type?: string
  modules?: {
    module_author?: {
      mid?: number | string
      name?: string
      face?: string
      pub_ts?: number
      pub_time?: string
    }
    module_dynamic?: {
      major?: {
        type?: string
        archive?: {
          aid?: string | number
          bvid?: string
          title?: string
          cover?: string
          jump_url?: string
          duration_text?: string
          duration?: number | string
          stat?: {
            play?: number | string
            danmaku?: number | string
          }
        }
      }
    }
  }
}

export interface VideoDynamicCard {
  dynamicId: string
  videoAid: string
  videoBvid: string
  title: string
  cover: string
  durationText: string
  durationSeconds: number
  /** 观看历史接口返回的实际观看秒数；看完时等于完整时长。 */
  watchedSeconds?: number
  playCount: number
  /** 首页、热门与排行榜接口返回的点赞数；动态流可能不提供。 */
  likeCount?: number
  danmakuCount: number
  upMid: string
  upName: string
  upAvatar: string
  publishAt: number
  url?: string
  rank?: number
  tag?: string
  /** B 站首页推荐流返回的负反馈类型，提交官方“不感兴趣”时原样回传。 */
  recommendationGoto?: string
  /** B 站首页推荐流的追踪标识，提交官方“不感兴趣”时原样回传。 */
  recommendationTrackId?: string
}

export interface DateGroup {
  key: string
  label: string
  items: VideoDynamicCard[]
}

export type LibraryKind = "favorites" | "history" | "watchlater"

export interface LiveRoomCard {
  roomId: string
  upMid: string
  upName: string
  upAvatar: string
  title: string
  cover: string
  areaName: string
  online: number
  url: string
}

export interface FavoriteFolder {
  id: number
  title: string
  mediaCount: number
}

export interface LibraryPageResult {
  cards: VideoDynamicCard[]
  hasMore: boolean
  nextMax?: number
  nextViewAt?: number
  nextBusiness?: string
}
