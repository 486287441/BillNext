<template>
  <main class="inbox-shell home-shell" :class="{ 'sidebar-collapsed': sidebarCollapsed, 'checklist-active': !libraryKind && activeTab === 'checklist', 'live-active': !libraryKind && activeTab === 'live' }">
    <AppNav
      :active="navActive"
      :trash-count="trash.count"
      :collapsed="sidebarCollapsed"
      @update:collapsed="setSidebarCollapsed"
      @open-trash="trash.setOpen(true)"
      @open-tools="openSettings"
      @navigate-library="navigateLibrary"
      @navigate-tab="selectTab"
    />
    <TopToolbar
      v-if="libraryKind || activeTab !== 'following'"
      ref="homeSettingsRef"
      :hide-want-watch="hideWantWatch"
      :open-video-on-want-watch="openVideoOnWantWatch"
      :hover-autoplay="hoverAutoplay"
      :sidebar-collapsed="sidebarCollapsed"
      @toggle-hide-want-watch="toggleHomeHideWantWatch"
      @toggle-open-video-on-want-watch="toggleHomeOpenVideoOnWantWatch"
      @toggle-hover-autoplay="toggleHomeHoverAutoplay"
      @toggle-sidebar-collapsed="toggleHomeSidebarCollapsed"
    />
    <WorkspaceToolbar
      v-if="libraryKind || (activeTab !== 'checklist' && activeTab !== 'live')"
      :scope="toolbarScope"
      :search-only="!libraryKind && activeTab === 'tracking'"
      :min-duration-minutes="toolbarMinDurationMinutes"
      :publish-after-date="toolbarPublishAfterDate"
      :blocked-keywords="homeBlockedKeywords"
      :keyword-filter-enabled="showHomeVideoFeed"
      :refreshing="toolbarRefreshing"
      @update:min-duration-minutes="setScopedMinDuration"
      @update:publish-after-date="setScopedPublishAfter"
      @update:blocked-keywords="setHomeBlockedKeywords"
      @update:search-query="setScopedSearchQuery"
      @refresh="refresh"
    />

    <LibraryView
      v-if="libraryKind"
      :kind="libraryKind"
      :cards="libraryCards"
      :folders="favoriteFolders"
      :active-folder-id="activeFavoriteFolderId"
      :loading="libraryLoading"
      :error="libraryError"
      :has-more="libraryHasMore"
      :filter-active="libraryFilterActive"
      :summary-cards="libraryKind === 'history' ? libraryStates.history.cards : libraryCards"
      :pending-map="libraryPendingMap"
      :want-watch-map="wantWatchMap"
      :open-video-on-want-watch="openVideoOnWantWatch"
      :hover-autoplay="hoverAutoplay"
      :following-up-map="decision.followingUpMap"
      :relation-pending-mid="decision.relationPendingMid"
      :transcriber-state-map="libraryTranscriberStateMap"
      @select-folder="selectFavoriteFolder"
      @load-more="loadLibrary(false)"
      @retry="loadLibrary(true)"
      @want-watch="onWantWatch"
      @help-read="onHelpRead"
      @dislike="onDislike"
      @toggle-follow="onToggleFollow"
      @add-favorite="onAddLibraryFavorite"
      @remove-favorite="onRemoveLibraryFavorite"
      @remove-watch-later="onRemoveLibraryWatchLater"
    />

    <DynamicFeed
      v-if="!libraryKind && activeTab === 'following'"
      ref="followingFeedRef"
      embedded
      :hover-autoplay="hoverAutoplay"
      @settings-change="onSettingsChange"
    />

    <LiveFollowingView
      v-if="!libraryKind && activeTab === 'live'"
      :rooms="liveRooms"
      :loading="liveLoading"
      :error="liveError"
      @refresh="loadLiveRooms"
    />

    <AnimeTrackingView
      v-if="!libraryKind && activeTab === 'tracking'"
      :items="trackedAnime"
      :loading="trackingLoading"
      :error="trackingError"
      @add="addTrackedAnime"
      @edit="editTrackedAnimeItem"
      @open="markAnimeSeen"
      @remove="removeTrackedAnime"
      @clear-error="trackingError = ''"
    />

    <ChecklistView
      v-if="!libraryKind && activeTab === 'checklist'"
      :watched-ids="watchedChecklistIds"
      :availability-map="checklistAvailability"
      @update:watched-ids="setWatchedChecklistIds"
      @availability="setChecklistAvailability"
    />

    <section v-if="showHomeVideoFeed && error" class="inbox-error home-feed-error">
      <span>{{ error }}</span><button type="button" @click="loadMore">重试</button>
    </section>

    <section v-else-if="showHomeVideoFeed" class="home-showcase">
      <div class="home-showcase-lead">
        <VideoCard
          v-for="card in leadCards.slice(0, 1)"
          :key="card.dynamicId"
          :card="card"
          :pending-map="decision.pendingMap"
          :want-watch-map="wantWatchMap"
          :open-video-on-want-watch="openVideoOnWantWatch"
          :hover-autoplay="hoverAutoplay"
          :following-up-map="decision.followingUpMap"
          :relation-pending-mid="decision.relationPendingMid"
          :transcriber-state="transcriber.getForCard(card)"
          layout-variant="featured"
          home-highlights
          home-layout
          @want-watch="onWantWatch(card)"
          @help-read="onHelpRead(card)"
          @dislike="onDislike(card)"
        />
        <TransitionGroup class="home-showcase-secondary" tag="div" name="home-card">
          <VideoCard
          v-for="card in leadCards.slice(1, 4)"
          :key="card.dynamicId"
          :card="card"
          :pending-map="decision.pendingMap"
          :want-watch-map="wantWatchMap"
          :open-video-on-want-watch="openVideoOnWantWatch"
          :hover-autoplay="hoverAutoplay"
          :following-up-map="decision.followingUpMap"
          :relation-pending-mid="decision.relationPendingMid"
          :transcriber-state="transcriber.getForCard(card)"
          layout-variant="compact"
          home-highlights
          home-layout
          @want-watch="onWantWatch(card)"
          @help-read="onHelpRead(card)"
          @dislike="onDislike(card)"
        />
        </TransitionGroup>
      </div>

      <div v-if="moreCards.length" class="home-showcase-section-head">
        <h2>更多推荐</h2>
      </div>
      <TransitionGroup v-if="moreCards.length" class="home-showcase-more" tag="div" name="home-card">
        <VideoCard
          v-for="card in moreCards"
          :key="card.dynamicId"
          :card="card"
          :pending-map="decision.pendingMap"
          :want-watch-map="wantWatchMap"
          :open-video-on-want-watch="openVideoOnWantWatch"
          :hover-autoplay="hoverAutoplay"
          :following-up-map="decision.followingUpMap"
          :relation-pending-mid="decision.relationPendingMid"
          :transcriber-state="transcriber.getForCard(card)"
          home-highlights
          home-layout
          layout-variant="standard"
          @want-watch="onWantWatch(card)"
          @help-read="onHelpRead(card)"
          @dislike="onDislike(card)"
        />
      </TransitionGroup>
    </section>

    <div v-if="showHomeVideoFeed" class="home-feed-sentinel">
      <span v-if="loading">正在获取内容…</span>
      <span v-else-if="hasMore">继续下滑，自动加载更多</span>
      <span v-else-if="cards.length">已经到底了</span>
    </div>

    <TrashModal :open="trash.open" :items="trash.items" @close="trash.setOpen(false)" @restore="onRestore" @restore-all="onRestoreAll" @clear-all="onClearAll" />
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from "vue"
import DynamicFeed from "./App.vue"
import AppNav from "../components/AppNav.vue"
import TopToolbar from "../components/TopToolbar.vue"
import type { HomeTabValue } from "../components/HomeTabsBar.vue"
import WorkspaceToolbar from "../components/WorkspaceToolbar.vue"
import AnimeTrackingView, { type AnimeEditorPayload } from "../components/AnimeTrackingView.vue"
import ChecklistView from "../components/ChecklistView.vue"
import LiveFollowingView from "../components/LiveFollowingView.vue"
import LibraryView from "../components/LibraryView.vue"
import TrashModal from "../components/TrashModal.vue"
import VideoCard from "../components/VideoCard.vue"
import type { FavoriteFolder, LibraryKind, LiveRoomCard, VideoDynamicCard } from "../domain/types"
import type { AnimeTrackingItem } from "../domain/anime-tracking"
import { getPublishAfterTimestamp } from "../domain/publish-date-filter"
import { isTitleBlocked, normalizeBlockedKeywords } from "../domain/title-keyword-filter"
import { getVideoIdentity } from "../domain/video-identity"
import {
  fetchFavoriteFolders,
  fetchFavoriteVideos,
  fetchHistoryVideos,
  fetchHomeFeedPage,
  fetchPopularVideosPage,
  fetchRankingVideos,
  fetchWatchLaterVideos,
  fetchFollowingLiveRooms,
  addVideoToDefaultFavorite,
  removeVideoFromFavorite,
  removeVideoFromWatchLater,
} from "../services/bilibili-api"
import { editTrackedAnime, fetchAnimeByName, refreshTrackedAnime } from "../services/anime-tracking"
import { readPersistedState, writePersistedState } from "../services/storage"
import { showToast } from "../services/toast"
import { useDecisionStore } from "../store/decision"
import { useTranscriberStore } from "../store/transcriber"
import { useTrashStore } from "../store/trash"

type HomeTab = HomeTabValue
const persisted = readPersistedState()
const decision = useDecisionStore()
const transcriber = useTranscriberStore()
const trash = useTrashStore()
const requestedTab = new URL(window.location.href).searchParams.get("billnext")
const libraryKind = ref<LibraryKind | null>(
  requestedTab === "favorites" || requestedTab === "history" || requestedTab === "watchlater" ? requestedTab : null,
)
const activeTab = ref<HomeTab>(requestedTab === "following" || requestedTab === "live" || requestedTab === "tracking" || requestedTab === "checklist" || requestedTab === "popular" || requestedTab === "ranking" ? requestedTab : "recommended")
const cards = ref<VideoDynamicCard[]>([])
const query = ref("")
const loading = ref(false)
const error = ref<string | null>(null)
const hasMore = ref(true)
const pageIndex = ref(1)
const homeMinDurationMinutes = ref(persisted.homeMinDurationMinutes)
const homePublishAfterDate = ref(persisted.homePublishAfterDate)
const homeBlockedKeywords = ref(persisted.homeBlockedKeywords)
const dynamicMinDurationMinutes = ref(persisted.dynamicMinDurationMinutes)
const dynamicPublishAfterDate = ref(persisted.dynamicPublishAfterDate)
const libraryMinDurationMinutes = reactive<Record<LibraryKind, string>>({
  favorites: persisted.favoritesMinDurationMinutes,
  history: persisted.historyMinDurationMinutes,
  watchlater: persisted.watchlaterMinDurationMinutes,
})
const libraryPublishAfterDate = reactive<Record<LibraryKind, string>>({
  favorites: persisted.favoritesPublishAfterDate,
  history: persisted.historyPublishAfterDate,
  watchlater: persisted.watchlaterPublishAfterDate,
})
const librarySearchQueries = reactive<Record<LibraryKind, string>>({ favorites: "", history: "", watchlater: "" })
const hideWantWatch = ref(persisted.hideWantWatch)
const openVideoOnWantWatch = ref(persisted.openVideoOnWantWatch)
const hoverAutoplay = ref(persisted.hoverAutoplay)
const sidebarCollapsed = ref(persisted.sidebarCollapsed)
const trackedAnime = ref<AnimeTrackingItem[]>(persisted.trackedAnime)
const watchedChecklistIds = ref<string[]>(persisted.watchedChecklistIds)
const checklistAvailability = ref(persisted.checklistAvailability)
const trackingLoading = ref(false)
const trackingError = ref("")
const liveRooms = ref<LiveRoomCard[]>([])
const liveLoading = ref(false)
const liveError = ref("")
const followingFeedRef = ref<{
  openSettings: () => void
  refreshFeed: () => void
  setMinDuration: (value: string) => void
  setPublishAfter: (value: string) => void
  setSearchQuery: (value: string) => void
} | null>(null)
const homeSettingsRef = ref<{ openToolsPanel: () => void } | null>(null)
const favoriteFolders = ref<FavoriteFolder[]>([])
const activeFavoriteFolderId = ref(0)
interface LibraryState {
  cards: VideoDynamicCard[]
  loading: boolean
  loaded: boolean
  error: string
  hasMore: boolean
  page: number
  historyMax: number
  historyViewAt: number
  historyBusiness: string
}
function createLibraryState(): LibraryState {
  return { cards: [], loading: false, loaded: false, error: "", hasMore: false, page: 1, historyMax: 0, historyViewAt: 0, historyBusiness: "" }
}
const libraryStates = reactive<Record<LibraryKind, LibraryState>>({
  favorites: createLibraryState(),
  history: createLibraryState(),
  watchlater: createLibraryState(),
})
const libraryActionPending = reactive<Record<string, boolean>>({})
const watchLaterLeadIds = ref<string[]>([])
let transcriberPollTimer = 0
let scrollRoot: HTMLElement | null = null
let scrollFrame = 0
let autoFilling = false

const PREFETCH_DISTANCE_PX = 1600
const MAX_AUTO_PAGES_PER_PASS = 12

const publishAfterTimestamp = computed(() => getPublishAfterTimestamp(homePublishAfterDate.value))
const visibleCards = computed(() => {
  const normalized = query.value.trim().toLocaleLowerCase()
  const minimumSeconds = Number(homeMinDurationMinutes.value) * 60
  return cards.value.filter((card) => {
    if (decision.isDisliked(card)) return false
    if (isTitleBlocked(card.title, homeBlockedKeywords.value)) return false
    if (hideWantWatch.value && decision.isWantWatch(card)) return false
    if (Number.isFinite(minimumSeconds) && minimumSeconds > 0 && card.durationSeconds < minimumSeconds) return false
    if (homePublishAfterDate.value && card.publishAt < publishAfterTimestamp.value) return false
    if (!normalized) return true
    return card.title.toLocaleLowerCase().includes(normalized) || card.upName.toLocaleLowerCase().includes(normalized)
  })
})
const wantWatchMap = computed(() => {
  const map: Record<string, boolean> = {}
  const candidates = [...cards.value, ...Object.values(libraryStates).flatMap((state) => state.cards)]
  for (const card of candidates) {
    if (decision.isWantWatch(card)) map[card.dynamicId] = true
  }
  return map
})
const navActive = computed(() => libraryKind.value ?? (activeTab.value === "following" ? "moments" : activeTab.value === "live" ? "live" : activeTab.value === "tracking" ? "tracking" : activeTab.value === "checklist" ? "checklist" : "home"))
const showHomeVideoFeed = computed(() => !libraryKind.value && !["following", "live", "tracking", "checklist"].includes(activeTab.value))
const toolbarScope = computed(() => libraryKind.value ?? (activeTab.value === "following" ? "dynamics" : "home"))
const toolbarMinDurationMinutes = computed(() => libraryKind.value ? libraryMinDurationMinutes[libraryKind.value] : activeTab.value === "following" ? dynamicMinDurationMinutes.value : homeMinDurationMinutes.value)
const toolbarPublishAfterDate = computed(() => libraryKind.value ? libraryPublishAfterDate[libraryKind.value] : activeTab.value === "following" ? dynamicPublishAfterDate.value : homePublishAfterDate.value)
const activeLibraryState = computed(() => libraryKind.value ? libraryStates[libraryKind.value] : null)
const libraryCards = computed(() => {
  const items = activeLibraryState.value?.cards ?? []
  const kind = libraryKind.value
  if (!kind) return items
  const normalized = librarySearchQueries[kind].trim().toLocaleLowerCase()
  const minimumSeconds = Number(libraryMinDurationMinutes[kind]) * 60
  const publishAfter = libraryPublishAfterDate[kind]
  const publishAfterTimestamp = getPublishAfterTimestamp(publishAfter)
  return items.filter((card) => {
    if (Number.isFinite(minimumSeconds) && minimumSeconds > 0 && card.durationSeconds < minimumSeconds) return false
    if (publishAfter && card.publishAt < publishAfterTimestamp) return false
    return !normalized || card.title.toLocaleLowerCase().includes(normalized) || card.upName.toLocaleLowerCase().includes(normalized)
  })
})
const libraryLoading = computed(() => activeLibraryState.value?.loading ?? false)
const libraryError = computed(() => activeLibraryState.value?.error ?? "")
const libraryHasMore = computed(() => activeLibraryState.value?.hasMore ?? false)
const libraryFilterActive = computed(() => {
  const kind = libraryKind.value
  return Boolean(kind && (librarySearchQueries[kind] || libraryMinDurationMinutes[kind] || libraryPublishAfterDate[kind]))
})
const libraryTranscriberStateMap = computed(() => Object.fromEntries(
  libraryCards.value.map((card) => [card.dynamicId, transcriber.getForCard(card)]),
))
const libraryPendingMap = computed(() => ({ ...decision.pendingMap, ...libraryActionPending }))
const toolbarRefreshing = computed(() => {
  if (libraryKind.value) return libraryLoading.value
  if (activeTab.value === "tracking") return trackingLoading.value
  if (activeTab.value === "live") return liveLoading.value
  return loading.value
})
const watchLaterReady = computed(() => libraryStates.watchlater.loaded || Boolean(libraryStates.watchlater.error))
const watchLaterLeadCards = computed(() => {
  const cardById = new Map(libraryStates.watchlater.cards.map((card) => [card.dynamicId, card]))
  return watchLaterLeadIds.value
    .map((id) => cardById.get(id))
    .filter((card): card is VideoDynamicCard => Boolean(card) && !decision.isDisliked(card) && !isTitleBlocked(card.title, homeBlockedKeywords.value))
})
const leadCards = computed(() => activeTab.value === "recommended"
  ? watchLaterLeadCards.value
  : visibleCards.value.slice(0, 4))
const moreCards = computed(() => {
  if (activeTab.value !== "recommended") return visibleCards.value.slice(4)
  if (!watchLaterReady.value) return []
  const leadIdentities = new Set(leadCards.value.map(getVideoIdentity))
  return visibleCards.value.filter((card) => !leadIdentities.has(getVideoIdentity(card)))
})

function sampleWatchLaterLeadCards(): void {
  const candidates = libraryStates.watchlater.cards.filter((card) => !decision.isDisliked(card) && !isTitleBlocked(card.title, homeBlockedKeywords.value))
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const current = candidates[index]
    candidates[index] = candidates[swapIndex]
    candidates[swapIndex] = current
  }
  watchLaterLeadIds.value = candidates.slice(0, 4).map((card) => card.dynamicId)
}

function fillWatchLaterLeadCards(): void {
  const candidates = libraryStates.watchlater.cards.filter((card) => !decision.isDisliked(card) && !isTitleBlocked(card.title, homeBlockedKeywords.value))
  const candidateIds = new Set(candidates.map((card) => card.dynamicId))
  const nextIds = watchLaterLeadIds.value.filter((id) => candidateIds.has(id))
  const selectedIds = new Set(nextIds)
  const replacements = candidates.filter((card) => !selectedIds.has(card.dynamicId))
  for (let index = replacements.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const current = replacements[index]
    replacements[index] = replacements[swapIndex]
    replacements[swapIndex] = current
  }
  for (const card of replacements) {
    if (nextIds.length >= 4) break
    nextIds.push(card.dynamicId)
  }
  watchLaterLeadIds.value = nextIds
}

async function loadLibrary(reset: boolean, requestedKind: LibraryKind | null = libraryKind.value): Promise<void> {
  const kind = requestedKind
  if (!kind) return
  const state = libraryStates[kind]
  if (state.loading) return
  state.loading = true
  state.error = ""
  try {
    if (reset) {
      state.page = 1
      state.hasMore = false
      state.historyMax = 0
      state.historyViewAt = 0
      state.historyBusiness = ""
    }
    if (kind === "favorites") {
      if (!favoriteFolders.value.length) {
        favoriteFolders.value = await fetchFavoriteFolders()
        activeFavoriteFolderId.value = favoriteFolders.value[0]?.id ?? 0
      }
      if (!activeFavoriteFolderId.value) return
      const result = await fetchFavoriteVideos(activeFavoriteFolderId.value, state.page)
      if (reset) state.cards = result.cards
      else {
        const known = new Set(state.cards.map((card) => card.dynamicId))
        state.cards.push(...result.cards.filter((card) => !known.has(card.dynamicId)))
      }
      state.hasMore = result.hasMore
    } else if (kind === "watchlater") {
      const result = await fetchWatchLaterVideos()
      state.cards = result.cards
      state.hasMore = false
      decision.syncWatchLaterCards(result.cards)
    } else {
      const result = await fetchHistoryVideos(state.historyMax, state.historyViewAt, state.historyBusiness)
      if (reset) state.cards = result.cards
      else {
        const known = new Set(state.cards.map((card) => card.dynamicId))
        state.cards.push(...result.cards.filter((card) => !known.has(card.dynamicId)))
      }
      state.hasMore = result.hasMore
      state.historyMax = result.nextMax ?? 0
      state.historyViewAt = result.nextViewAt ?? 0
      state.historyBusiness = result.nextBusiness ?? ""
    }
    state.page += 1
    state.loaded = true
    void decision.ensureFollowingStatuses(state.cards)
  } catch (caught) {
    state.error = caught instanceof Error ? caught.message : "资料库加载失败"
  } finally {
    state.loading = false
    if (kind === "history" && libraryKind.value === "history") scheduleAutoFill()
  }
}

function selectFavoriteFolder(folderId: number): void {
  if (folderId === activeFavoriteFolderId.value) return
  activeFavoriteFolderId.value = folderId
  libraryStates.favorites.loaded = false
  void loadLibrary(true)
}

function navigateLibrary(kind: LibraryKind): void {
  if (libraryKind.value === kind) return
  libraryKind.value = kind
  const url = new URL(window.location.href)
  url.pathname = "/"
  url.search = ""
  url.searchParams.set("billnext", kind)
  window.history.pushState({ billnext: kind }, "", url.toString())
  scrollRoot?.scrollTo({ top: 0, behavior: "smooth" })
  if (kind === "history" || !libraryStates[kind].loaded) void loadLibrary(true, kind)
}

function syncLibraryFromUrl(): void {
  const value = new URL(window.location.href).searchParams.get("billnext")
  const kind = value === "favorites" || value === "history" || value === "watchlater" ? value : null
  libraryKind.value = kind
  if (kind) {
    if (kind === "history" || !libraryStates[kind].loaded) void loadLibrary(true, kind)
    return
  }
  const nextTab: HomeTab = value === "following" || value === "live" || value === "tracking" || value === "checklist" || value === "popular" || value === "ranking" ? value : "recommended"
  if (activeTab.value === nextTab) return
  activeTab.value = nextTab
  query.value = ""
  if (nextTab === "tracking") void refreshTrackedAnimeList()
  else if (nextTab === "live") void loadLiveRooms()
  else if (nextTab !== "following" && nextTab !== "checklist" && !cards.value.length) void refresh()
}

async function selectTab(tab: HomeTab): Promise<void> {
  const leavingLibrary = Boolean(libraryKind.value)
  if (leavingLibrary) {
    libraryKind.value = null
  }
  if (!leavingLibrary && activeTab.value === tab) {
    void refresh()
    return
  }
  activeTab.value = tab
  const tabUrl = new URL(window.location.href)
  if (tab === "recommended") tabUrl.searchParams.delete("billnext")
  else tabUrl.searchParams.set("billnext", tab)
  window.history.pushState({ billnext: tab }, "", tabUrl.toString())
  query.value = ""
  if (tab === "following") return
  if (tab === "live") {
    void loadLiveRooms()
    return
  }
  if (tab === "tracking") {
    void refreshTrackedAnimeList()
    return
  }
  if (tab === "checklist") return
  void refresh()
}

async function requestPage(): Promise<{ cards: VideoDynamicCard[]; hasMore: boolean }> {
  if (activeTab.value === "popular") return fetchPopularVideosPage(pageIndex.value++)
  if (activeTab.value === "ranking") return fetchRankingVideos()
  return fetchHomeFeedPage(pageIndex.value++)
}

async function loadMore(): Promise<void> {
  if (loading.value || !hasMore.value) return
  loading.value = true
  error.value = null
  try {
    const page = await requestPage()
    const known = new Set(cards.value.map((card) => card.dynamicId))
    const freshCards = page.cards.filter((card) => !known.has(card.dynamicId) && !decision.isDisliked(card))
    cards.value.push(...freshCards)
    hasMore.value = page.hasMore
    decision.syncWantWatchCards(freshCards)
    void decision.ensureFollowingStatuses(freshCards)
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "内容加载失败"
  } finally {
    loading.value = false
    if (!autoFilling) scheduleAutoFill()
  }
}

function isNearFeedEnd(): boolean {
  if (!scrollRoot) return false
  return scrollRoot.scrollHeight - scrollRoot.scrollTop - scrollRoot.clientHeight <= PREFETCH_DISTANCE_PX
}

function historyTodayBoundaryLoaded(): boolean {
  const historyCards = libraryStates.history.cards
  if (!historyCards.length) return false
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000
  return historyCards[historyCards.length - 1].publishAt < todayStart
}

async function fillScrollBuffer(): Promise<void> {
  const fillingHistory = libraryKind.value === "history"
  if (autoFilling || (!showHomeVideoFeed.value && !fillingHistory)) return
  autoFilling = true
  try {
    let loadedPages = 0
    const maxPages = MAX_AUTO_PAGES_PER_PASS
    while ((fillingHistory ? libraryStates.history.hasMore : hasMore.value)
      && (fillingHistory
        ? !historyTodayBoundaryLoaded() || libraryCards.value.length < 12 || isNearFeedEnd()
        : visibleCards.value.length < 12 || isNearFeedEnd())
      && loadedPages < maxPages) {
      if (fillingHistory) await loadLibrary(false, "history")
      else await loadMore()
      loadedPages += 1
      await nextTick()
      if (fillingHistory ? libraryStates.history.error : error.value) break
    }
  } finally {
    autoFilling = false
  }
}

function scheduleAutoFill(): void {
  if (scrollFrame) return
  scrollFrame = window.requestAnimationFrame(() => {
    scrollFrame = 0
    void fillScrollBuffer()
  })
}
async function refresh(): Promise<void> {
  if (libraryKind.value) {
    await loadLibrary(true)
    return
  }
  if (activeTab.value === "following") {
    followingFeedRef.value?.refreshFeed()
    return
  }
  if (activeTab.value === "tracking") {
    await refreshTrackedAnimeList()
    return
  }
  if (activeTab.value === "live") {
    await loadLiveRooms()
    return
  }
  if (activeTab.value === "checklist") return
  cards.value = []
  pageIndex.value = 1
  hasMore.value = true
  if (activeTab.value === "recommended") {
    await Promise.all([loadLibrary(true, "watchlater"), loadMore()])
    sampleWatchLaterLeadCards()
  } else {
    await loadMore()
  }
}

function persistTrackedAnime(): void {
  writePersistedState({ trackedAnime: trackedAnime.value })
}

async function addTrackedAnime(payload: AnimeEditorPayload): Promise<void> {
  if (trackingLoading.value) return
  trackingLoading.value = true
  trackingError.value = ""
  try {
    const item = await fetchAnimeByName(payload.title, payload.sourceUrl)
    const existingIndex = trackedAnime.value.findIndex((row) => row.id === item.id)
    if (existingIndex >= 0) {
      const existing = trackedAnime.value[existingIndex]
      trackedAnime.value.splice(existingIndex, 1, { ...item, seenEpisodeKey: existing.seenEpisodeKey || item.latestEpisodeKey })
      showToast("这部番已经在追番列表中，已刷新信息")
    } else {
      trackedAnime.value.push({ ...item, seenEpisodeKey: item.latestEpisodeKey })
      showToast("已加入正在追番")
    }
    persistTrackedAnime()
  } catch (caught) {
    trackingError.value = caught instanceof Error ? caught.message : "添加失败"
  } finally {
    trackingLoading.value = false
  }
}

async function editTrackedAnimeItem(payload: AnimeEditorPayload & { item: AnimeTrackingItem }): Promise<void> {
  if (trackingLoading.value) return
  trackingLoading.value = true
  trackingError.value = ""
  try {
    const updated = await editTrackedAnime(payload.item, payload.title, payload.sourceUrl)
    const nextItems = [...trackedAnime.value]
    let originalIndex = nextItems.findIndex((item) => item.id === payload.item.id)
    const duplicateIndex = nextItems.findIndex((item, index) => index !== originalIndex && item.id === updated.id)
    if (duplicateIndex >= 0) {
      nextItems.splice(duplicateIndex, 1)
      if (duplicateIndex < originalIndex) originalIndex -= 1
    }
    if (originalIndex >= 0) nextItems.splice(originalIndex, 1, updated)
    else nextItems.push(updated)
    trackedAnime.value = nextItems
    persistTrackedAnime()
    showToast("追番信息已更新")
  } catch (caught) {
    trackingError.value = caught instanceof Error ? caught.message : "编辑失败"
  } finally {
    trackingLoading.value = false
  }
}

async function refreshTrackedAnimeList(): Promise<void> {
  if (trackingLoading.value || !trackedAnime.value.length) return
  trackingLoading.value = true
  trackingError.value = ""
  const results = await Promise.allSettled(trackedAnime.value.map((item) => refreshTrackedAnime(item)))
  let failed = 0
  trackedAnime.value = trackedAnime.value.map((item, index) => {
    const result = results[index]
    if (result.status === "fulfilled") return result.value
    failed += 1
    return item
  })
  persistTrackedAnime()
  if (failed) trackingError.value = `${failed} 部番暂时刷新失败，已保留上次信息`
  trackingLoading.value = false
}

function markAnimeSeen(item: AnimeTrackingItem): void {
  if (item.seenEpisodeKey === item.latestEpisodeKey) return
  item.seenEpisodeKey = item.latestEpisodeKey
  persistTrackedAnime()
}

function removeTrackedAnime(item: AnimeTrackingItem): void {
  if (!window.confirm(`确认不再追「${item.title}」？`)) return
  trackedAnime.value = trackedAnime.value.filter((row) => row.id !== item.id)
  persistTrackedAnime()
  showToast("已移出正在追番")
}

function openSettings(): void {
  if (!libraryKind.value && activeTab.value === "following") {
    followingFeedRef.value?.openSettings()
    return
  }
  homeSettingsRef.value?.openToolsPanel()
}

function toggleHomeHideWantWatch(): void {
  hideWantWatch.value = !hideWantWatch.value
  writePersistedState({ hideWantWatch: hideWantWatch.value })
  showToast(hideWantWatch.value ? "已隐藏标记为“想看”的视频" : "已显示标记为“想看”的视频")
  scheduleAutoFill()
}

function toggleHomeOpenVideoOnWantWatch(): void {
  openVideoOnWantWatch.value = !openVideoOnWantWatch.value
  writePersistedState({ openVideoOnWantWatch: openVideoOnWantWatch.value })
  showToast(openVideoOnWantWatch.value ? "点击“想看”时将打开视频" : "点击“想看”时不再打开视频")
}

function toggleHomeHoverAutoplay(): void {
  hoverAutoplay.value = !hoverAutoplay.value
  writePersistedState({ hoverAutoplay: hoverAutoplay.value })
  showToast(hoverAutoplay.value ? "已开启悬停自动播放" : "已关闭悬停自动播放")
}

function toggleHomeSidebarCollapsed(): void {
  setSidebarCollapsed(!sidebarCollapsed.value)
  showToast(sidebarCollapsed.value ? "左侧导航已固定收起" : "左侧导航已固定展开")
}

async function loadLiveRooms(): Promise<void> {
  if (liveLoading.value) return
  liveLoading.value = true
  liveError.value = ""
  try {
    liveRooms.value = await fetchFollowingLiveRooms()
  } catch (caught) {
    liveError.value = caught instanceof Error ? caught.message : "直播列表加载失败"
  } finally {
    liveLoading.value = false
  }
}

function setWatchedChecklistIds(value: string[]): void {
  watchedChecklistIds.value = value
  writePersistedState({ watchedChecklistIds: value })
}
function setChecklistAvailability(value: import("../domain/checklist").ChecklistAvailability): void {
  checklistAvailability.value = { ...checklistAvailability.value, [value.key]: value }
  writePersistedState({ checklistAvailability: checklistAvailability.value })
}
function setScopedMinDuration(value: string): void {
  if (libraryKind.value) {
    const kind = libraryKind.value
    libraryMinDurationMinutes[kind] = value
    if (kind === "favorites") writePersistedState({ favoritesMinDurationMinutes: value })
    else if (kind === "history") writePersistedState({ historyMinDurationMinutes: value })
    else writePersistedState({ watchlaterMinDurationMinutes: value })
    scheduleAutoFill()
    return
  }
  if (activeTab.value === "following") {
    dynamicMinDurationMinutes.value = value
    followingFeedRef.value?.setMinDuration(value)
    return
  }
  homeMinDurationMinutes.value = value
  writePersistedState({ homeMinDurationMinutes: value })
  scheduleAutoFill()
}
function setHomeBlockedKeywords(value: string[]): void {
  homeBlockedKeywords.value = normalizeBlockedKeywords(value)
  writePersistedState({ homeBlockedKeywords: homeBlockedKeywords.value })
  fillWatchLaterLeadCards()
  scheduleAutoFill()
}
function setScopedPublishAfter(value: string): void {
  if (libraryKind.value) {
    const kind = libraryKind.value
    libraryPublishAfterDate[kind] = value
    if (kind === "favorites") writePersistedState({ favoritesPublishAfterDate: value })
    else if (kind === "history") writePersistedState({ historyPublishAfterDate: value })
    else writePersistedState({ watchlaterPublishAfterDate: value })
    scheduleAutoFill()
    return
  }
  if (activeTab.value === "following") {
    dynamicPublishAfterDate.value = value
    followingFeedRef.value?.setPublishAfter(value)
    return
  }
  homePublishAfterDate.value = value
  writePersistedState({ homePublishAfterDate: value })
  scheduleAutoFill()
}
function setScopedSearchQuery(value: string): void {
  if (libraryKind.value) {
    librarySearchQueries[libraryKind.value] = value
    scheduleAutoFill()
  } else if (activeTab.value === "following") followingFeedRef.value?.setSearchQuery(value)
}
function setSidebarCollapsed(value: boolean): void {
  if (sidebarCollapsed.value === value) return
  sidebarCollapsed.value = value
  writePersistedState({ sidebarCollapsed: value })
}
function onSettingsChange(settings: {
  dynamicMinDurationMinutes: string
  dynamicPublishAfterDate: string
    hideWantWatch: boolean
    openVideoOnWantWatch: boolean
    hoverAutoplay: boolean
    sidebarCollapsed: boolean
}): void {
  dynamicMinDurationMinutes.value = settings.dynamicMinDurationMinutes
  dynamicPublishAfterDate.value = settings.dynamicPublishAfterDate
  hideWantWatch.value = settings.hideWantWatch
  openVideoOnWantWatch.value = settings.openVideoOnWantWatch
  hoverAutoplay.value = settings.hoverAutoplay
  if (sidebarCollapsed.value !== settings.sidebarCollapsed) setSidebarCollapsed(settings.sidebarCollapsed)
  if (showHomeVideoFeed.value && visibleCards.value.length < 12 && hasMore.value) {
    void loadMore()
  }
}
async function onWantWatch(card: VideoDynamicCard): Promise<void> { await decision.markWantWatch(card) }
async function runLibraryAction(card: VideoDynamicCard, action: () => Promise<void>, successMessage: string, removeFrom?: LibraryKind): Promise<void> {
  if (libraryActionPending[card.dynamicId]) return
  libraryActionPending[card.dynamicId] = true
  try {
    await action()
    if (removeFrom) libraryStates[removeFrom].cards = libraryStates[removeFrom].cards.filter((item) => item.dynamicId !== card.dynamicId)
    showToast(successMessage)
  } catch (caught) {
    showToast(caught instanceof Error ? caught.message : "操作失败", "error")
  } finally {
    delete libraryActionPending[card.dynamicId]
  }
}
function onAddLibraryFavorite(card: VideoDynamicCard): void {
  void runLibraryAction(card, () => addVideoToDefaultFavorite(card), "已加入收藏")
}
function onRemoveLibraryFavorite(card: VideoDynamicCard): void {
  const mediaId = activeFavoriteFolderId.value
  void runLibraryAction(card, () => removeVideoFromFavorite(card, mediaId), "已取消收藏", "favorites")
}
function onRemoveLibraryWatchLater(card: VideoDynamicCard): void {
  void runLibraryAction(card, async () => {
    await removeVideoFromWatchLater(card)
    decision.forgetWatchLater(card)
  }, "已移出稍后再看", "watchlater")
}
function onHelpRead(card: VideoDynamicCard): void {
  transcriber.markTranscribing(card)
  window.setTimeout(() => void transcriber.refresh().catch(() => undefined), 1500)
}
async function onDislike(card: VideoDynamicCard): Promise<void> {
  const isWatchLaterCard = card.dynamicId.startsWith("watchlater:") || decision.isWantWatch(card)
  const mode = !isWatchLaterCard && !libraryKind.value && activeTab.value === "recommended" && card.recommendationTrackId
    ? "home-recommendation"
    : "local"
  if (!(await decision.markDislike(card, mode))) return
  const identity = getVideoIdentity(card)
  cards.value = cards.value.filter((item) => getVideoIdentity(item) !== identity)
  for (const state of Object.values(libraryStates)) state.cards = state.cards.filter((item) => getVideoIdentity(item) !== identity)
  if (isWatchLaterCard && !libraryKind.value && activeTab.value === "recommended") fillWatchLaterLeadCards()
  if (visibleCards.value.length < 12 && hasMore.value) void loadMore()
}
async function onToggleFollow(card: VideoDynamicCard): Promise<void> {
  if (!card.upMid) return
  await decision.toggleFollowCreator(card.upMid, card.upName)
}
function onRestore(dynamicId: string): void {
  const item = trash.items.find((row) => row.dynamicId === dynamicId)
  if (!item) return
  decision.restoreDisliked(item.card)
  if (!cards.value.some((card) => card.dynamicId === dynamicId)) cards.value.unshift(item.card)
  showToast("已恢复")
}
function onRestoreAll(): void { for (const item of [...trash.items]) onRestore(item.dynamicId) }
function onClearAll(): void {
  if (!trash.items.length || !window.confirm("确认永久清空 " + trash.items.length + " 条记录？")) return
  decision.clearAllDisliked()
  showToast("垃圾箱已清空")
}
onMounted(() => {
  void transcriber.refresh().catch(() => undefined)
  transcriberPollTimer = window.setInterval(() => {
    if (Object.values(transcriber.cards).some((item) => item.state === "transcribing")) void transcriber.refresh().catch(() => undefined)
  }, 5000)
  scrollRoot = document.getElementById("billnext-inbox-root")
  scrollRoot?.addEventListener("scroll", scheduleAutoFill, { passive: true })
  window.addEventListener("popstate", syncLibraryFromUrl)
  if (libraryKind.value) void loadLibrary(true)
  else if (activeTab.value === "tracking") void refreshTrackedAnimeList()
  else if (activeTab.value === "live") void loadLiveRooms()
  else if (activeTab.value !== "checklist") void refresh()
})
onUnmounted(() => {
  scrollRoot?.removeEventListener("scroll", scheduleAutoFill)
  window.removeEventListener("popstate", syncLibraryFromUrl)
  if (scrollFrame) window.cancelAnimationFrame(scrollFrame)
  if (transcriberPollTimer) window.clearInterval(transcriberPollTimer)
})
</script>
