<template>
  <article class="video-card" :class="[{ 'is-home-layout': homeLayout, 'has-context-menu': actionsOpen }, homeLayout ? `is-home-${layoutVariant}` : '']" :data-dynamic-id="card.dynamicId" ref="cardRef" @mouseenter="startHoverPreview" @mouseleave="stopHoverPreview" @keydown.esc.stop="closeActions" @focusout="onActionFocusOut" @contextmenu.prevent.stop="onRightClickDislike" @keydown="onContextKey">
    <div class="video-cover-wrap">
      <a class="video-cover-link" :href="videoUrl" target="_blank" rel="noopener noreferrer" @click.stop>
        <img class="video-cover" :src="coverUrl" :alt="card.title" :loading="isFeaturedHomeCard ? 'eager' : 'lazy'" :fetchpriority="isFeaturedHomeCard ? 'high' : 'auto'" />
        <video
          v-if="previewActive && previewUrl"
          ref="previewVideoRef"
          class="video-hover-preview"
          :class="{ ready: previewReady }"
          :src="previewUrl"
          autoplay
          muted
          loop
          playsinline
          preload="auto"
          @canplay="onPreviewCanPlay"
        ></video>
        <span v-if="card.rank" class="video-rank-badge">{{ card.rank }}</span>
        <span v-if="card.durationText" class="video-duration-badge">{{ card.durationText }}</span>
      </a>

    </div>
    <div class="video-info-row">
      <div class="video-meta">
        <a ref="titleRef" class="video-title" :href="videoUrl" target="_blank" rel="noopener noreferrer" :title="card.title" @click.stop>{{ card.title }}</a>
        <div class="video-meta-slot">
        <div class="video-subtitle" :class="{ 'has-home-badge': homeBadgeLabel }">
          <span v-if="homeBadgeLabel" class="video-home-badge">{{ homeBadgeLabel }}</span>
          <a class="video-up" :href="upSpaceUrl" target="_blank" rel="noopener noreferrer" @click.stop>{{ card.upName }}</a>
          <span aria-hidden="true">·</span><span>{{ playCountLabel }}播放</span>
          <span aria-hidden="true">·</span><span class="video-publish-date">{{ publishLabel }}</span>
        </div>
        <div class="video-inline-actions" role="group" aria-label="快捷操作">
          <button v-if="actionMode === 'default'" type="button" :class="{ 'is-saved': isWantWatched }" :title="isPending ? '处理中…' : isWantWatched ? '已想看' : '想看'" :disabled="isPending" @click.stop="onWantWatchClick"><span aria-hidden="true">{{ isWantWatched ? '★' : '☆' }}</span><span class="video-action-label">{{ isPending ? "处理中…" : isWantWatched ? "已想看" : "想看" }}</span></button>
          <button v-if="actionMode === 'watchlater'" type="button" :disabled="isPending" @click.stop="$emit('add-favorite')"><span aria-hidden="true">☆</span>收藏</button>
          <button class="video-help-action" type="button" :title="helpReadLabel" :disabled="isPending || Boolean(transcriberState)" @click="helpMeRead"><span aria-hidden="true">✦</span><span class="video-action-label">{{ helpReadLabel }}</span></button>
        </div>
        </div>
      </div>
    </div>
    <Transition name="motion-popover">
    <div v-if="actionsOpen" ref="contextMenuRef" class="video-actions-menu" role="group" aria-label="视频操作">
      <button v-if="actionMode === 'favorites'" type="button" :disabled="isPending" @click.stop="$emit('remove-favorite')">{{ isPending ? "处理中…" : "取消收藏" }}</button>
      <button v-if="actionMode === 'watchlater'" type="button" :disabled="isPending" @click.stop="$emit('remove-watch-later')">{{ isPending ? "处理中…" : "移出稍后再看" }}</button>
      <button v-if="showFollowControl && card.upMid" type="button" :disabled="isRelationPending || isRelationUnknown" @click.stop="$emit('toggle-follow')">{{ isRelationPending ? "处理中…" : isRelationUnknown ? "读取中…" : isFollowing ? "取消关注" : "关注" }}</button>
      <button v-if="actionMode === 'default'" class="video-negative-action" type="button" :disabled="isPending" @click.stop="$emit('dislike')">不想看</button>
    </div>
    </Transition>
  </article>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue"
import type { VideoDynamicCard } from "../domain/types"
import type { TranscriberCardState } from "../store/transcriber"
import { showToast } from "../services/toast"
import { getVideoUrl, openVideoInNewTab } from "../utils/video-url"
import { getVideoPreviewUrl } from "../services/video-preview"

const props = defineProps<{
  card: VideoDynamicCard
  pendingMap: Record<string, boolean>
  wantWatchMap: Record<string, boolean>
  openVideoOnWantWatch: boolean
  hoverAutoplay?: boolean
  followingUpMap: Record<string, boolean>
  relationPendingMid: string
  transcriberState?: TranscriberCardState
  actionMode?: "default" | "favorites" | "watchlater"
  /** 首页推荐卡片关闭关注操作。 */
  homeHighlights?: boolean
  /** 首页专属大小卡排布；操作菜单与动态和资料库共用。 */
  homeLayout?: boolean
  layoutVariant?: "featured" | "compact" | "standard"
}>()
const emit = defineEmits<{
  (event: "want-watch"): void
  (event: "dislike"): void
  (event: "toggle-follow"): void
  (event: "help-read"): void
  (event: "add-favorite"): void
  (event: "remove-favorite"): void
  (event: "remove-watch-later"): void
}>()

const actionMode = computed(() => props.actionMode ?? "default")
const layoutVariant = computed(() => props.layoutVariant ?? "standard")
const isFeaturedHomeCard = computed(() => props.homeLayout === true && layoutVariant.value === "featured")
const showFollowControl = computed(() => props.homeHighlights !== true)
const cardRef = ref<HTMLElement | null>(null)
const titleRef = ref<HTMLAnchorElement | null>(null)
const contextMenuRef = ref<HTMLElement | null>(null)
const actionsOpen = ref(false)
function onRightClickDislike(): void {
  if (isPending.value) return
  actionsOpen.value = false
  stopHoverPreview()
  emit("dislike")
}
async function openContextActions(): Promise<void> {
  actionsOpen.value = true
  await nextTick()
  contextMenuRef.value?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true })
}
function onContextKey(event: KeyboardEvent): void {
  if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
    event.preventDefault()
    event.stopPropagation()
    void openContextActions()
  }
}
function closeActions(): void {
  actionsOpen.value = false
  titleRef.value?.focus({ preventScroll: true })
}
function onActionFocusOut(event: FocusEvent): void {
  if (!cardRef.value?.contains(event.relatedTarget as Node | null)) actionsOpen.value = false
}
function onOutsidePointer(event: PointerEvent): void {
  if (!cardRef.value?.contains(event.target as Node)) actionsOpen.value = false
}
watch(actionsOpen, (open) => {
  if (open) document.addEventListener("pointerdown", onOutsidePointer)
  else document.removeEventListener("pointerdown", onOutsidePointer)
})
onBeforeUnmount(() => document.removeEventListener("pointerdown", onOutsidePointer))
const HOVER_PREVIEW_DELAY_MS = 150
const previewVideoRef = ref<HTMLVideoElement | null>(null)
const previewUrl = ref("")
const previewActive = ref(false)
const previewReady = ref(false)
let previewTimer = 0
let previewToken = 0

function startHoverPreview(): void {
  if (!props.hoverAutoplay || (!props.card.videoBvid && !props.card.videoAid)) return
  previewToken += 1
  const token = previewToken
  if (previewTimer) window.clearTimeout(previewTimer)
  previewTimer = window.setTimeout(async () => {
    previewTimer = 0
    const url = previewUrl.value || await getVideoPreviewUrl(props.card)
    if (!url || token !== previewToken || !props.hoverAutoplay) return
    previewUrl.value = url
    previewActive.value = true
    await nextTick()
    if (token === previewToken) void previewVideoRef.value?.play().catch(() => undefined)
  }, HOVER_PREVIEW_DELAY_MS)
}

function stopHoverPreview(): void {
  previewToken += 1
  if (previewTimer) {
    window.clearTimeout(previewTimer)
    previewTimer = 0
  }
  previewVideoRef.value?.pause()
  previewActive.value = false
  previewReady.value = false
}

function onPreviewCanPlay(): void {
  previewReady.value = true
}

watch(() => props.hoverAutoplay, (enabled) => {
  if (!enabled) stopHoverPreview()
})
onBeforeUnmount(stopHoverPreview)

function onWantWatchClick(): void {
  if (props.openVideoOnWantWatch) openVideoInNewTab(props.card)
  emit("want-watch")
}
async function helpMeRead(event: MouseEvent): Promise<void> {
  event.stopPropagation()
  event.preventDefault()
  if (isPending.value || props.transcriberState?.state === "transcribing") return
  const url = videoUrl.value
  let copied = false
  try {
    await navigator.clipboard.writeText(url)
    copied = true
  } catch {
    const textarea = document.createElement("textarea")
    textarea.value = url
    textarea.style.position = "fixed"
    textarea.style.opacity = "0"
    document.body.appendChild(textarea)
    textarea.select()
    copied = document.execCommand("copy")
    document.body.removeChild(textarea)
  }
  if (!copied) {
    showToast("复制失败，无法交给 Transcriber", "error")
    return
  }
  emit("help-read")
  showToast("已复制链接，Transcriber 将自动接收")
}

const coverUrl = computed(() => {
  if (!props.card.cover) return ""
  if (!/hdslb\.com/i.test(props.card.cover)) return props.card.cover
  if (isFeaturedHomeCard.value) return props.card.cover + "@1280w_720h_1c"
  if (props.homeLayout && layoutVariant.value === "compact") return props.card.cover + "@480w_270h_1c"
  return props.card.cover + "@672w_378h_1c"
})
const videoUrl = computed(() => getVideoUrl(props.card))
const helpReadLabel = computed(() => {
  if (props.transcriberState?.state === "completed") return "帮读已完成"
  if (props.transcriberState?.state === "transcribing") return "正在帮读"
  return "帮我读"
})
const upSpaceUrl = computed(() => props.card.upMid ? "https://space.bilibili.com/" + props.card.upMid : "https://space.bilibili.com/")
const publishLabel = computed(() => {
  const date = new Date(props.card.publishAt * 1000)
  return String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0")
})
const isPending = computed(() => Boolean(props.pendingMap[props.card.dynamicId]))
const isWantWatched = computed(() => Boolean(props.wantWatchMap[props.card.dynamicId]))
const isFollowing = computed(() => Boolean(props.card.upMid) && props.followingUpMap[props.card.upMid] === true)
const homeBadgeLabel = computed(() => {
  if (!props.homeLayout || !props.homeHighlights || layoutVariant.value !== "standard") return ""
  if (isFollowing.value) return "已关注"
  const likes = props.card.likeCount ?? 0
  if (!Number.isFinite(likes) || likes < 10_000) return ""
  return `${Math.floor(likes / 10_000)}万点赞`
})
const isRelationUnknown = computed(() => Boolean(props.card.upMid) && props.followingUpMap[props.card.upMid] === undefined)
const isRelationPending = computed(() => Boolean(props.card.upMid) && props.relationPendingMid === props.card.upMid)
function formatCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0"
  if (value >= 100000000) return (value / 100000000).toFixed(1).replace(/\.0$/, "") + "亿"
  if (value >= 10000) return (value / 10000).toFixed(1).replace(/\.0$/, "") + "万"
  return String(value)
}
const playCountLabel = computed(() => formatCount(props.card.playCount))
</script>
