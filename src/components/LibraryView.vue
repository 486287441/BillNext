<template>
  <section class="library-view" :class="{ 'library-view-history': kind === 'history' }">
    <PageHeader :title="title" :subtitle="subtitle">
      <template v-if="kind === 'history'" #meta>
        <p class="library-history-summary" aria-live="polite">今日 {{ todayHistoryCount }} 个视频 <span aria-hidden="true">·</span> {{ todayHistoryDuration }}</p>
      </template>
    </PageHeader>
    <div class="library-controls">
      <slot name="controls" />
    </div>

    <div v-if="kind === 'favorites' && folders.length" ref="folderStrip" class="library-folders" :class="{ 'has-more-right': foldersOverflowRight }" aria-label="收藏夹" tabindex="0" @scroll.passive="updateFolderOverflow">
      <button
        v-for="folder in folders"
        :key="folder.id"
        type="button"
        :class="{ active: folder.id === activeFolderId }"
        :aria-pressed="folder.id === activeFolderId"
        @click="$emit('select-folder', folder.id)"
      >
        <span>{{ folder.title }}</span><small>{{ folder.mediaCount }}</small>
      </button>
    </div>

    <template v-if="kind === 'history'">
      <div v-if="loading && !cards.length" class="library-state"><Icon icon="line-md:loading-twotone-loop" /><span>正在整理观看足迹…</span></div>
      <div v-else-if="error && !cards.length" class="library-state is-error"><Icon icon="mingcute:warning-line" /><span>{{ error }}</span><button type="button" @click="$emit('retry')">重试</button></div>
      <div v-else-if="!cards.length" class="library-state history-empty"><Icon :icon="filterActive ? 'mingcute:search-2-line' : emptyIcon" /><span>{{ emptyText }}</span><small>{{ filterActive ? '试试调整关键词、日期或视频时长' : '看过的视频会按时间出现在这里' }}</small></div>

      <div v-else class="history-timeline" aria-label="观看历史时间线">
        <section v-for="(group, groupIndex) in historyGroups" :key="group.key" class="history-period" :class="{ 'is-today': group.isToday }">
          <div class="history-period-marker" aria-hidden="true">
            <span><Icon :icon="group.icon" /></span>
          </div>
          <header class="history-period-heading">
            <div>
              <p>{{ group.eyebrow }}</p>
              <h2>{{ group.label }}<small :aria-label="`${group.items.length} 条记录`">{{ group.items.length }}</small></h2>
            </div>
          </header>

          <MotionList class="history-period-list" tag="div" name="history-row">
            <article v-for="card in group.items" :key="card.dynamicId" class="history-row">
              <a class="history-row-cover" :href="getVideoUrl(card)" target="_blank" rel="noopener noreferrer">
                <img :src="historyCover(card.cover)" :alt="card.title" loading="lazy" />
                <span v-if="card.durationText">{{ card.durationText }}</span>
              </a>
              <div class="history-row-copy">
                <div class="history-row-time"><Icon icon="mingcute:time-line" /><time :datetime="historyDateTime(card.publishAt)">{{ historyTime(card.publishAt) }}</time><i></i><span>{{ relativeWatchTime(card.publishAt) }}</span></div>
                <a class="history-row-title" :href="getVideoUrl(card)" target="_blank" rel="noopener noreferrer" :title="card.title">{{ card.title }}</a>
                <div class="history-row-meta">
                  <a :href="upSpaceUrl(card.upMid)" target="_blank" rel="noopener noreferrer">{{ card.upName || '未知 UP 主' }}</a>
                  <span v-if="card.playCount">{{ formatCount(card.playCount) }} 播放</span>
                  <span v-if="card.danmakuCount">{{ formatCount(card.danmakuCount) }} 弹幕</span>
                </div>
              </div>

            </article>
          </MotionList>
          <span v-if="groupIndex === historyGroups.length - 1" class="history-timeline-cap" aria-hidden="true"></span>
        </section>
      </div>

      <div v-if="cards.length" class="history-stream-status" role="status">
        <template v-if="loading"><Icon icon="line-md:loading-twotone-loop" /><span>正在接上更早的足迹…</span></template>
        <template v-else-if="error"><Icon icon="mingcute:warning-line" /><span>{{ error }}</span><button type="button" @click="$emit('load-more')">重试</button></template>
        <template v-else-if="!hasMore"><span class="history-stream-end-dot"></span><span>已经走到这段历史的起点</span></template>
        <template v-else><span class="history-stream-end-dot"></span><span>继续下滑，查看更早的足迹</span></template>
      </div>
    </template>

    <template v-else>
      <div v-if="loading && !cards.length" class="library-state"><Icon icon="line-md:loading-twotone-loop" /><span>正在加载{{ title }}…</span></div>
      <div v-else-if="error" class="library-state is-error"><Icon icon="mingcute:warning-line" /><span>{{ error }}</span><button type="button" @click="$emit('retry')">重试</button></div>
      <div v-else-if="!cards.length" class="library-state"><Icon :icon="emptyIcon" /><span>{{ emptyText }}</span></div>

      <MotionList v-else class="home-video-grid library-five-grid" tag="div" name="home-card">
        <VideoCard
          v-for="card in cards"
          :key="card.dynamicId"
          :card="card"
          :pending-map="pendingMap"
          :want-watch-map="wantWatchMap"
          :open-video-on-want-watch="openVideoOnWantWatch"
          :hover-autoplay="hoverAutoplay"
          :following-up-map="followingUpMap"
          :relation-pending-mid="relationPendingMid"
          :transcriber-state="transcriberStateMap[card.dynamicId]"
          :action-mode="kind === 'favorites' ? 'favorites' : 'watchlater'"
          @want-watch="$emit('want-watch', card)"
          @help-read="$emit('help-read', card)"
          @dislike="$emit('dislike', card)"
          @toggle-follow="$emit('toggle-follow', card)"
          @add-favorite="$emit('add-favorite', card)"
          @remove-favorite="$emit('remove-favorite', card)"
          @remove-watch-later="$emit('remove-watch-later', card)"
        />
      </MotionList>

      <button v-if="hasMore && cards.length" class="library-load-more" type="button" :disabled="loading" @click="$emit('load-more')">
        {{ loading ? "加载中…" : "加载更多" }}
      </button>
    </template>
  </section>
</template>

<script setup lang="ts">
import PageHeader from "./PageHeader.vue"
import MotionList from "./MotionList.vue"
import { Icon } from "@iconify/vue"
import { computed, ref, watch, onBeforeUnmount } from "vue"
import type { FavoriteFolder, LibraryKind, VideoDynamicCard } from "../domain/types"
import type { TranscriberCardState } from "../store/transcriber"
import { getVideoUrl } from "../utils/video-url"
import VideoCard from "./VideoCard.vue"

const props = defineProps<{
  kind: LibraryKind
  cards: VideoDynamicCard[]
  folders: FavoriteFolder[]
  activeFolderId: number
  loading: boolean
  error: string
  hasMore: boolean
  filterActive: boolean
  summaryCards: VideoDynamicCard[]
  pendingMap: Record<string, boolean>
  wantWatchMap: Record<string, boolean>
  openVideoOnWantWatch: boolean
  hoverAutoplay: boolean
  followingUpMap: Record<string, boolean>
  relationPendingMid: string
  transcriberStateMap: Record<string, TranscriberCardState | undefined>
}>()
defineEmits<{
  (event: "select-folder", folderId: number): void
  (event: "load-more"): void
  (event: "retry"): void
  (event: "want-watch", card: VideoDynamicCard): void
  (event: "help-read", card: VideoDynamicCard): void
  (event: "dislike", card: VideoDynamicCard): void
  (event: "toggle-follow", card: VideoDynamicCard): void
  (event: "add-favorite", card: VideoDynamicCard): void
  (event: "remove-favorite", card: VideoDynamicCard): void
  (event: "remove-watch-later", card: VideoDynamicCard): void
}>()

const folderStrip = ref<HTMLElement | null>(null)
const foldersOverflowRight = ref(false)
let folderResizeObserver: ResizeObserver | undefined
function updateFolderOverflow(): void {
  const strip = folderStrip.value
  foldersOverflowRight.value = !!strip && strip.scrollWidth - strip.clientWidth - strip.scrollLeft > 2
}
watch(folderStrip, (strip) => {
  folderResizeObserver?.disconnect()
  if (strip) {
    folderResizeObserver = new ResizeObserver(updateFolderOverflow)
    folderResizeObserver.observe(strip)
  }
  updateFolderOverflow()
}, { flush: "post" })
watch(() => props.folders, updateFolderOverflow, { deep: true, flush: "post" })
onBeforeUnmount(() => folderResizeObserver?.disconnect())

const title = computed(() => ({ favorites: "我的收藏", history: "观看历史", watchlater: "稍后再看" })[props.kind])
const subtitle = computed(() => ({
  favorites: "整理并查看你收藏的内容",
  history: "找回最近看过的视频",
  watchlater: "留到合适的时候，再认真看完",
})[props.kind])
const emptyText = computed(() => props.filterActive
  ? ({ favorites: "没有符合当前条件的收藏", history: "没有找到符合条件的观看记录", watchlater: "没有符合当前条件的稍后再看" })[props.kind]
  : ({ favorites: "这个收藏夹还是空的", history: "暂时没有观看记录", watchlater: "稍后再看列表还是空的" })[props.kind])
const emptyIcon = computed(() => ({ favorites: "mingcute:star-line", history: "mingcute:time-line", watchlater: "mingcute:carplay-line" })[props.kind])

const todayHistoryCards = computed(() => {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000
  return props.summaryCards.filter((card) => card.publishAt >= todayStart)
})
const todayHistoryCount = computed(() => todayHistoryCards.value.length)
const todayHistoryDuration = computed(() => {
  const seconds = todayHistoryCards.value.reduce((total, card) => total + (card.watchedSeconds ?? card.durationSeconds), 0)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}小时${minutes ? `${minutes}分` : ""}`
  if (minutes > 0) return `${minutes}分钟`
  return seconds > 0 ? "不足1分钟" : "0分钟"
})

interface HistoryGroup {
  key: string
  label: string
  eyebrow: string
  icon: string
  isToday: boolean
  items: VideoDynamicCard[]
}

const historyGroups = computed<HistoryGroup[]>(() => {
  const now = new Date()
  const nowSeconds = now.getTime() / 1000
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000
  const definitions = [
    { key: "last-hour", label: "最近一小时", eyebrow: "NOW · 今天", icon: "mingcute:flash-line", isToday: true },
    { key: "three-hours", label: "三小时内", eyebrow: "TODAY · 今天", icon: "mingcute:time-line", isToday: true },
    { key: "today", label: "今天早些时候", eyebrow: "TODAY · 今天", icon: "mingcute:sun-line", isToday: true },
    { key: "yesterday", label: "昨天", eyebrow: "YESTERDAY · 昨日", icon: "mingcute:moon-line", isToday: false },
    { key: "week", label: "近 7 天", eyebrow: "THIS WEEK · 本周", icon: "mingcute:calendar-line", isToday: false },
    { key: "month", label: "近 30 天", eyebrow: "RECENT · 最近", icon: "mingcute:calendar-2-line", isToday: false },
    { key: "earlier", label: "更早", eyebrow: "ARCHIVE · 往日", icon: "mingcute:archive-line", isToday: false },
  ]
  const groups = definitions.map((definition) => ({ ...definition, items: [] as VideoDynamicCard[] }))
  for (const card of props.cards) {
    const watchedAt = card.publishAt
    const age = Math.max(0, nowSeconds - watchedAt)
    const dayAge = Math.floor((todayStart - new Date(new Date(watchedAt * 1000).getFullYear(), new Date(watchedAt * 1000).getMonth(), new Date(watchedAt * 1000).getDate()).getTime() / 1000) / 86400)
    const index = watchedAt >= todayStart && age <= 3600 ? 0
      : watchedAt >= todayStart && age <= 10800 ? 1
        : watchedAt >= todayStart ? 2
          : dayAge === 1 ? 3
            : dayAge <= 7 ? 4
              : dayAge <= 30 ? 5 : 6
    groups[index].items.push(card)
  }
  return groups.filter((group) => group.items.length)
})

function historyCover(cover: string): string {
  if (!cover || !/hdslb\.com/i.test(cover)) return cover
  return cover + "@672w_378h_1c"
}
function historyDateTime(timestamp: number): string { return new Date(timestamp * 1000).toISOString() }
function historyTime(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}
function relativeWatchTime(timestamp: number): string {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp))
  if (seconds < 60) return "刚刚看过"
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前看过`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前看过`
  return "看过"
}
function upSpaceUrl(mid: string): string { return mid ? `https://space.bilibili.com/${mid}` : "https://space.bilibili.com/" }
function formatCount(value: number): string {
  if (value >= 100000000) return `${(value / 100000000).toFixed(1).replace(/\.0$/, "")}亿`
  if (value >= 10000) return `${(value / 10000).toFixed(1).replace(/\.0$/, "")}万`
  return String(value)
}

</script>
