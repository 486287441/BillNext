<template>
  <main class="inbox-shell" :class="{ 'dynamic-feed-embedded': props.embedded, 'feed-hidden': props.embedded && !props.feedVisible, 'sidebar-collapsed': !props.embedded && sidebarCollapsed }">
    <AppNav v-if="!props.embedded" active="moments" :trash-count="trash.count" :collapsed="sidebarCollapsed" @update:collapsed="onSidebarCollapsedUpdate" @open-trash="trash.setOpen(true)" @open-tools="openDynamicTools" @navigate-tab="onSharedTabSelect" />
    <TopToolbar
      ref="toolbarRef"
      :hide-want-watch="hideWantWatch"
      :open-video-on-want-watch="openVideoOnWantWatch"
      :hover-autoplay="hoverAutoplay"
      :sidebar-collapsed="sidebarCollapsed"
      @toggle-hide-want-watch="onToggleHideWantWatch"
      @toggle-open-video-on-want-watch="onToggleOpenVideoOnWantWatch"
      @toggle-hover-autoplay="onToggleHoverAutoplay"
      @toggle-sidebar-collapsed="onToggleSidebarCollapsed"
    />

    <section v-if="viewMode === 'inbox' && inbox.error" class="inbox-error">
      {{ inbox.error }}
    </section>

    <section v-else-if="viewMode === 'inbox'" class="inbox-content dynamic-inbox-content">
      <InboxGroup
        v-for="group in displayGroups"
        :key="group.key"
        :group="group"
        :pending-map="decision.pendingMap"
        :want-watch-map="wantWatchMap"
        :open-video-on-want-watch="openVideoOnWantWatch"
        :hover-autoplay="hoverAutoplay"
        :final-count-map="filteredFinalGroupCounts"
        :leave-reason-map="cardLeaveReasons"
        :enter-card-ids="inbox.enterAnimatedIds"
        :following-up-map="decision.followingUpMap"
        :relation-pending-mid="decision.relationPendingMid"
        :transcriber-map="transcriberMap"
        @want-watch="onWantWatch"
        @help-read="onHelpRead"
        @dislike="onDislike"
        @toggle-follow="onToggleFollow"
        @leave-complete="onCardLeaveComplete"
        @enter-complete="onCardEnterComplete"
      />
      <p v-if="inbox.loading && visibleCardCount === 0" class="inbox-load-more-tip">正在加载动态...</p>
      <p v-else-if="isFillingList" class="inbox-load-more-tip">正在补足列表...</p>
      <p v-else-if="!inbox.loading && !isFillingList && displayGroups.length === 0">
        {{
          (searchScope === "dynamics" && normalizedQuery) || minDurationSeconds > 0 || publishAfterDate
            ? "没有匹配到筛选条件的视频。"
            : "暂无可展示的视频动态。"
        }}
      </p>
      <p v-else-if="inbox.loadingMore && !inbox.prefetching" class="inbox-load-more-tip">正在加载更多...</p>
      <p v-else-if="!inbox.hasMore && displayGroups.length > 0" class="inbox-load-more-tip">已经到底了</p>
    </section>

    <UpFilterView v-else-if="viewMode === 'up-filter'" />

    <TrashModal
      v-if="!props.embedded"
      :open="trash.open"
      :items="trash.items"
      @close="trash.setOpen(false)"
      @restore="onRestore"
      @restore-all="onRestoreAll"
      @clear-all="onClearAll"
    />
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue"

import TopToolbar from "../components/TopToolbar.vue"
import AppNav from "../components/AppNav.vue"
import type { HomeTabValue } from "../components/HomeTabsBar.vue"
import UpFilterView from "../components/UpFilterView.vue"
import TrashModal from "../components/TrashModal.vue"
import type { ViewMode } from "../domain/view-mode"
import { getDateGroupKey } from "../domain/group-by-date"
import { getPublishAfterTimestamp, normalizePublishAfterDate } from "../domain/publish-date-filter"
import type { DateGroup, VideoDynamicCard } from "../domain/types"
import InboxGroup from "../components/InboxGroup.vue"
import { useDecisionStore } from "../store/decision"
import { useInboxStore } from "../store/inbox"
import { useUpFilterStore } from "../store/up-filter"
import { useTrashStore } from "../store/trash"
import { useTranscriberStore } from "../store/transcriber"
import { readPersistedState, writePersistedState } from "../services/storage"
import { fetchWatchLaterVideos } from "../services/bilibili-api"
import { showToast } from "../services/toast"
import { type CardLeaveVariant } from "../utils/motion"

type SearchScope = "dynamics" | "bilibili"

const persistedState = readPersistedState()
const props = withDefaults(defineProps<{ embedded?: boolean; feedVisible?: boolean; hoverAutoplay?: boolean }>(), {
  embedded: false,
  feedVisible: true,
})
const emit = defineEmits<{
  (event: "settings-change", settings: {
    dynamicMinDurationMinutes: string
    dynamicPublishAfterDate: string
    hideWantWatch: boolean
    openVideoOnWantWatch: boolean
    hoverAutoplay: boolean
    sidebarCollapsed: boolean
  }): void
}>()
const inbox = useInboxStore()
const upFilter = useUpFilterStore()
const decision = useDecisionStore()
const trash = useTrashStore()
const transcriber = useTranscriberStore()
const searchQuery = ref("")
const searchScope = ref<SearchScope>("dynamics")
const viewMode = ref<ViewMode>(persistedState.viewMode)
const minDurationMinutes = ref(persistedState.dynamicMinDurationMinutes)
const publishAfterDate = ref(persistedState.dynamicPublishAfterDate)
const hideWantWatch = ref(persistedState.hideWantWatch)
const openVideoOnWantWatch = ref(persistedState.openVideoOnWantWatch)
const hoverAutoplay = ref(props.hoverAutoplay ?? persistedState.hoverAutoplay)
const sidebarCollapsed = ref(persistedState.sidebarCollapsed)
const cardLeaveReasons = ref<Record<string, CardLeaveVariant>>({})
const leavingGroupCounts = ref<Record<string, number>>({})
let pendingFillAfterLeave = 0
let scrollRoot: HTMLElement | null = null
let onScrollHandler: (() => void) | null = null
let scrollRaf = 0
let transcriberPollTimer = 0
const toolbarRef = ref<{ openToolsPanel: () => void } | null>(null)

function reloadMoments(): void {
  void inbox.refresh(getScrollRoot(), passesDisplayFilters)
}

function openDynamicTools(): void {
  toolbarRef.value?.openToolsPanel()
}

function setMinDuration(value: string): void {
  onMinDurationMinutesUpdate(value)
}

function setPublishAfter(value: string): void {
  onPublishAfterDateUpdate(value)
}

function setSearchQuery(value: string): void {
  searchScope.value = "dynamics"
  searchQuery.value = value
  void inbox.fillAfterHide(getScrollRoot(), passesDisplayFilters)
}

defineExpose({ openSettings: openDynamicTools, refreshFeed: reloadMoments, setMinDuration, setPublishAfter, setSearchQuery })

function onSharedTabSelect(tab: HomeTabValue): void {
  if (tab === "following") return
  window.location.href = tab === "recommended"
    ? "https://www.bilibili.com/"
    : "https://www.bilibili.com/?billnext=" + tab
}

function getScrollRoot(): HTMLElement | null {
  if (scrollRoot instanceof HTMLElement) {
    return scrollRoot
  }
  const root = document.getElementById("billnext-inbox-root")
  if (root instanceof HTMLElement) {
    scrollRoot = root
    return root
  }
  return null
}

const normalizedQuery = computed(() => searchQuery.value.trim().toLocaleLowerCase())
const hasActiveDisplayFilters = computed(
  () =>
    (searchScope.value === "dynamics" && normalizedQuery.value.length > 0) ||
    minDurationSeconds.value > 0 ||
    publishAfterDate.value.length > 0 ||
    hideWantWatch.value,
)
const minDurationSeconds = computed(() => {
  const text = minDurationMinutes.value.trim()
  if (!text) {
    return 0
  }
  const value = Number(text)
  if (!Number.isFinite(value) || value <= 0) {
    return 0
  }
  return Math.floor(value * 60)
})

function passesDisplayFilters(item: VideoDynamicCard): boolean {
  if (decision.isDisliked(item)) return false
  if (hideWantWatch.value && decision.isWantWatch(item)) {
    return false
  }
  const matchesDuration =
    minDurationSeconds.value <= 0 ||
    item.durationSeconds >= minDurationSeconds.value
  if (!matchesDuration) {
    return false
  }
  if (publishAfterDate.value && item.publishAt < getPublishAfterTimestamp(publishAfterDate.value)) {
    return false
  }
  if (searchScope.value !== "dynamics" || !normalizedQuery.value) {
    return true
  }
  const title = item.title.toLocaleLowerCase()
  const upName = item.upName.toLocaleLowerCase()
  return title.includes(normalizedQuery.value) || upName.includes(normalizedQuery.value)
}

const displayGroups = computed<DateGroup[]>(() => {
  return inbox.groups
    .map((group) => {
      const items = group.items.filter((item) => passesDisplayFilters(item))
      return {
        ...group,
        items,
      }
    })
    .filter((group) => group.items.length > 0 || (leavingGroupCounts.value[group.key] ?? 0) > 0)
})

const filteredFinalGroupCounts = computed(() => {
  if (!hasActiveDisplayFilters.value) {
    return inbox.finalGroupCounts
  }
  const counts: Record<string, number> = {}
  for (const card of Object.values(inbox.countedCards)) {
    if (!passesDisplayFilters(card)) {
      continue
    }
    const key = getDateGroupKey(card.publishAt)
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
})

const visibleCardCount = computed(() => {
  return displayGroups.value.reduce((count, group) => count + group.items.length, 0)
})

const wantWatchMap = computed(() => {
  const map: Record<string, boolean> = {}
  for (const card of inbox.allCards) {
    if (decision.isWantWatch(card)) map[card.dynamicId] = true
  }
  return map
})


const transcriberMap = computed(() => {
  const map: Record<string, ReturnType<typeof transcriber.getForCard>> = {}
  for (const card of inbox.allCards) {
    map[card.dynamicId] = transcriber.getForCard(card)
  }
  return map
})

const isFillingList = computed(() => {
  return inbox.prefetching || (inbox.loadingMore && visibleCardCount.value < 18)
})

function markCardLeaving(card: VideoDynamicCard, reason: CardLeaveVariant): void {
  cardLeaveReasons.value = { ...cardLeaveReasons.value, [card.dynamicId]: reason }
  const groupKey = getDateGroupKey(card.publishAt)
  leavingGroupCounts.value = {
    ...leavingGroupCounts.value,
    [groupKey]: (leavingGroupCounts.value[groupKey] ?? 0) + 1,
  }
}

function scheduleFillAfterLeave(): void {
  pendingFillAfterLeave += 1
}

function runPendingFillAfterLeave(): void {
  if (pendingFillAfterLeave <= 0) {
    return
  }
  pendingFillAfterLeave -= 1
  void inbox.fillAfterHide(getScrollRoot(), passesDisplayFilters)
}

function onCardLeaveComplete(payload: { dynamicId: string; groupKey: string }): void {
  const nextReasons = { ...cardLeaveReasons.value }
  delete nextReasons[payload.dynamicId]
  cardLeaveReasons.value = nextReasons

  const remaining = (leavingGroupCounts.value[payload.groupKey] ?? 1) - 1
  if (remaining <= 0) {
    const nextCounts = { ...leavingGroupCounts.value }
    delete nextCounts[payload.groupKey]
    leavingGroupCounts.value = nextCounts
  } else {
    leavingGroupCounts.value = { ...leavingGroupCounts.value, [payload.groupKey]: remaining }
  }

  runPendingFillAfterLeave()
}

function onCardEnterComplete(dynamicId: string): void {
  inbox.clearEnterAnimatedId(dynamicId)
}

async function onWantWatch(card: VideoDynamicCard): Promise<void> {
  if (hideWantWatch.value) {
    markCardLeaving(card, "want-watch")
  }
  await decision.markWantWatch(card)
  if (hideWantWatch.value) {
    scheduleFillAfterLeave()
  }
}

async function onDislike(card: VideoDynamicCard): Promise<void> {
  markCardLeaving(card, "dislike")
  if (!(await decision.markDislike(card))) {
    cancelCardLeaving(card)
    return
  }
  scheduleFillAfterLeave()
}

async function onToggleFollow(card: VideoDynamicCard): Promise<void> {
  if (!card.upMid) return
  await decision.toggleFollowCreator(card.upMid, card.upName)
}

function onToggleHideWantWatch(): void {
  hideWantWatch.value = !hideWantWatch.value
  writePersistedState({ hideWantWatch: hideWantWatch.value })
  emitSettingsChange()
  showToast(hideWantWatch.value ? "已隐藏标记为“想看”的视频" : "已显示标记为“想看”的视频")
  void inbox.fillAfterHide(getScrollRoot(), passesDisplayFilters)
}

function onToggleOpenVideoOnWantWatch(): void {
  openVideoOnWantWatch.value = !openVideoOnWantWatch.value
  writePersistedState({ openVideoOnWantWatch: openVideoOnWantWatch.value })
  emitSettingsChange()
  showToast(openVideoOnWantWatch.value ? "点击“想看”时将打开视频" : "点击“想看”时不再打开视频")
}

function onToggleHoverAutoplay(): void {
  hoverAutoplay.value = !hoverAutoplay.value
  writePersistedState({ hoverAutoplay: hoverAutoplay.value })
  emitSettingsChange()
  showToast(hoverAutoplay.value ? "已开启悬停自动播放" : "已关闭悬停自动播放")
}

function onSidebarCollapsedUpdate(value: boolean): void {
  if (sidebarCollapsed.value === value) return
  sidebarCollapsed.value = value
  writePersistedState({ sidebarCollapsed: value })
  emitSettingsChange()
}

function onToggleSidebarCollapsed(): void {
  onSidebarCollapsedUpdate(!sidebarCollapsed.value)
  showToast(sidebarCollapsed.value ? "左侧导航已固定收起" : "左侧导航已固定展开")
}

function onMinDurationMinutesUpdate(value: string): void {
  const trimmed = value.trim()
  const numeric = Number(trimmed)
  if (trimmed && (!Number.isFinite(numeric) || numeric <= 0)) {
    showToast("请输入大于 0 的视频时长", "error")
    return
  }
  const normalized = trimmed ? String(numeric) : ""
  minDurationMinutes.value = normalized
  writePersistedState({ dynamicMinDurationMinutes: normalized })
  emitSettingsChange()
  showToast(normalized ? `已只显示 ${normalized} 分钟及以上的视频` : "已清除时长筛选")
  void inbox.fillAfterHide(getScrollRoot(), passesDisplayFilters)
}

function onPublishAfterDateUpdate(value: string): void {
  const normalized = normalizePublishAfterDate(value)
  if (value.trim() && !normalized) {
    showToast("请选择有效的发布日期", "error")
    return
  }
  publishAfterDate.value = normalized
  writePersistedState({ dynamicPublishAfterDate: normalized })
  emitSettingsChange()
  showToast(normalized ? `已只显示 ${normalized} 当天及之后的视频` : "已清除日期筛选")
  void inbox.fillAfterHide(getScrollRoot(), passesDisplayFilters)
}

function emitSettingsChange(): void {
  emit("settings-change", {
    dynamicMinDurationMinutes: minDurationMinutes.value,
    dynamicPublishAfterDate: publishAfterDate.value,
    hideWantWatch: hideWantWatch.value,
    openVideoOnWantWatch: openVideoOnWantWatch.value,
    hoverAutoplay: hoverAutoplay.value,
    sidebarCollapsed: sidebarCollapsed.value,
  })
}

function onHelpRead(card: VideoDynamicCard): void {
  transcriber.markTranscribing(card)
  window.setTimeout(() => void transcriber.refresh().catch(() => undefined), 1500)
}

function cancelCardLeaving(card: VideoDynamicCard): void {
  const nextReasons = { ...cardLeaveReasons.value }
  delete nextReasons[card.dynamicId]
  cardLeaveReasons.value = nextReasons
  const groupKey = getDateGroupKey(card.publishAt)
  const remaining = (leavingGroupCounts.value[groupKey] ?? 1) - 1
  if (remaining <= 0) {
    const nextCounts = { ...leavingGroupCounts.value }
    delete nextCounts[groupKey]
    leavingGroupCounts.value = nextCounts
  } else {
    leavingGroupCounts.value = { ...leavingGroupCounts.value, [groupKey]: remaining }
  }
}

watch(
  () => inbox.allCards.map((card) => `${card.dynamicId}:${card.title}`).join("\n"),
  () => {
    decision.syncWantWatchCards(inbox.allCards)
    void decision.ensureFollowingStatuses(inbox.allCards)
  },
)

watch(() => props.hoverAutoplay, (value) => {
  if (typeof value === "boolean") hoverAutoplay.value = value
})

function onViewModeUpdate(mode: ViewMode): void {
  viewMode.value = mode
  if (mode !== "up-filter") writePersistedState({ viewMode: mode })
  if (mode === "inbox") {
    void inbox.fillAfterHide(getScrollRoot(), passesDisplayFilters)
    return
  }
  upFilter.refreshWantedVideos()
  void upFilter.bootstrap()
}

function onRestore(dynamicId: string): void {
  const item = trash.items.find((row) => row.dynamicId === dynamicId)
  if (!item) {
    return
  }
  decision.restoreDisliked(item.card)
  inbox.restoreCard(dynamicId, item.card)
  showToast("已恢复到收件箱")
}

function onRestoreAll(): void {
  const count = trash.items.length
  if (count === 0) {
    return
  }
  inbox.restoreAllHidden(trash.items.map((item) => item.card))
  decision.clearAllDisliked()
  showToast(`已恢复 ${count} 条视频`)
}

function onClearAll(): void {
  const count = trash.items.length
  if (count === 0) {
    return
  }
  const confirmed = window.confirm(
    `确认清空垃圾箱中的 ${count} 条记录？清空后不会恢复到收件箱。`,
  )
  if (!confirmed) {
    return
  }
  decision.clearAllDisliked()
  showToast(`已清空 ${count} 条记录`)
}

onMounted(() => {
  if (!props.embedded) {
    void fetchWatchLaterVideos()
      .then((result) => decision.syncWatchLaterCards(result.cards))
      .catch(() => undefined)
  }
  const root = getScrollRoot()
  if (!root) {
    return
  }

  void transcriber.refresh().catch(() => undefined)
  transcriberPollTimer = window.setInterval(() => {
    if (Object.values(transcriber.cards).some((item) => item.state === "transcribing")) {
      void transcriber.refresh().catch(() => undefined)
    }
  }, 5000)
  void inbox.bootstrap(root, passesDisplayFilters)
  if (viewMode.value === "up-filter") {
    void upFilter.bootstrap()
  }

  onScrollHandler = () => {
    if (scrollRaf) {
      return
    }
    scrollRaf = window.requestAnimationFrame(() => {
      scrollRaf = 0
      if (viewMode.value === "inbox") {
        void inbox.maintainScrollBuffer(root)
      }
    })
  }

  root.addEventListener("scroll", onScrollHandler, { passive: true })
})

onUnmounted(() => {
  inbox.stopBackgroundWork()
  if (transcriberPollTimer) {
    window.clearInterval(transcriberPollTimer)
    transcriberPollTimer = 0
  }
  if (scrollRaf) {
    window.cancelAnimationFrame(scrollRaf)
    scrollRaf = 0
  }
  if (scrollRoot && onScrollHandler) {
    scrollRoot.removeEventListener("scroll", onScrollHandler)
  }
})
</script>
