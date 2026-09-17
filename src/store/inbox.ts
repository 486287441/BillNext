import { defineStore } from "pinia"

import { filterVideoDynamics } from "../domain/filter-video"
import { getDateGroupKey, groupByDate } from "../domain/group-by-date"
import type { DateGroup, VideoDynamicCard } from "../domain/types"
import { fetchMomentsPage } from "../services/bilibili-api"
import { takeInboxFirstPagePreload } from "../services/inbox-preload"
import { readPersistedState } from "../services/storage"
import { getDistanceToBottom, getScrollBufferPx, waitForLayout } from "../utils/layout"

const persistedState = readPersistedState()

const MIN_VISIBLE_CARDS = 18
const MAX_AUTOFILL_PAGES = 20
const MAX_BUFFER_PAGES = 8
const VIEWPORT_GAP_PX = 160
const SCROLL_BUFFER_VIEWPORTS = 1
const SCROLL_PREFETCH_VIEWPORTS = 2
type CardPredicate = (card: VideoDynamicCard) => boolean

interface InboxState {
  loading: boolean
  loadingMore: boolean
  prefetching: boolean
  hasMore: boolean
  nextOffset: string
  error: string | null
  rawTotal: number
  videoTotal: number
  groups: DateGroup[]
  hiddenIds: Set<string>
  seenRawIds: Set<string>
  allCards: VideoDynamicCard[]
  seenCardIds: Set<string>
  countedCardIds: Set<string>
  countedCards: Record<string, VideoDynamicCard>
  finalGroupCounts: Record<string, number>
  countingFinalCounts: boolean
  finalCountsReady: boolean
  countScanToken: number
  backgroundWorkToken: number
  enterAnimatedIds: string[]
}

export const useInboxStore = defineStore("inbox", {
  state: (): InboxState => ({
    loading: false,
    loadingMore: false,
    prefetching: false,
    hasMore: true,
    nextOffset: "",
    error: null,
    rawTotal: 0,
    videoTotal: 0,
    groups: [],
    hiddenIds: new Set(persistedState.dislikedDynamicIds),
    seenRawIds: new Set(),
    allCards: [],
    seenCardIds: new Set(),
    countedCardIds: new Set(),
    countedCards: {},
    finalGroupCounts: {},
    countingFinalCounts: false,
    finalCountsReady: false,
    countScanToken: 0,
    backgroundWorkToken: 0,
    enterAnimatedIds: [],
  }),
  actions: {
    clearEnterAnimatedId(dynamicId: string) {
      if (!dynamicId) {
        return
      }
      this.enterAnimatedIds = this.enterAnimatedIds.filter((id) => id !== dynamicId)
    },
    addCountForCard(card: VideoDynamicCard) {
      if (this.hiddenIds.has(card.dynamicId)) {
        return
      }
      if (this.countedCardIds.has(card.dynamicId)) {
        return
      }
      const key = getDateGroupKey(card.publishAt)
      this.finalGroupCounts[key] = (this.finalGroupCounts[key] ?? 0) + 1
      this.countedCardIds.add(card.dynamicId)
      this.countedCards[card.dynamicId] = card
    },
    addCountsForCards(cards: VideoDynamicCard[]) {
      for (const card of cards) {
        this.addCountForCard(card)
      }
    },
    async runFinalCountScan(startOffset: string, token: number) {
      if (!startOffset) {
        this.countingFinalCounts = false
        this.finalCountsReady = true
        return
      }

      this.countingFinalCounts = true
      let offset = startOffset
      let hasMore = true
      const seenRawInScan = new Set(this.seenRawIds)

      try {
        while (hasMore && offset && token === this.countScanToken) {
          const page = await fetchMomentsPage(offset)
          offset = page.nextOffset
          hasMore = page.hasMore

          const freshItems = page.items.filter((item) => {
            const id = typeof item.id_str === "string" ? item.id_str : ""
            if (!id || seenRawInScan.has(id)) {
              return false
            }
            seenRawInScan.add(id)
            return true
          })

          const cards = filterVideoDynamics(freshItems)
          for (const card of cards) {
            if (this.seenCardIds.has(card.dynamicId)) {
              continue
            }
            this.addCountForCard(card)
          }
        }
      } catch {
        // Keep current visible flow stable even if count prefetch fails.
      } finally {
        if (token === this.countScanToken) {
          this.countingFinalCounts = false
          this.finalCountsReady = true
        }
      }
    },
    rebuildGroups() {
      const visibleCards = this.allCards.filter((card) => !this.hiddenIds.has(card.dynamicId))
      this.videoTotal = visibleCards.length
      this.groups = groupByDate(visibleCards)
    },
    countVisibleCards(predicate?: CardPredicate): number {
      return this.allCards.filter((card) => !this.hiddenIds.has(card.dynamicId) && (!predicate || predicate(card))).length
    },
    needsMoreVisible(scrollRoot: HTMLElement | null, minVisible = MIN_VISIBLE_CARDS, predicate?: CardPredicate): boolean {
      if (this.countVisibleCards(predicate) < minVisible) {
        return true
      }
      if (!scrollRoot) {
        return false
      }
      return scrollRoot.scrollHeight <= scrollRoot.clientHeight + VIEWPORT_GAP_PX
    },
    needsScrollBuffer(scrollRoot: HTMLElement | null): boolean {
      if (!scrollRoot || !this.hasMore) {
        return false
      }
      return getDistanceToBottom(scrollRoot) < getScrollBufferPx(scrollRoot, SCROLL_PREFETCH_VIEWPORTS)
    },
    hasScrollBuffer(scrollRoot: HTMLElement | null): boolean {
      if (!scrollRoot) {
        return true
      }
      return getDistanceToBottom(scrollRoot) >= getScrollBufferPx(scrollRoot, SCROLL_BUFFER_VIEWPORTS)
    },
    async maintainScrollBuffer(scrollRoot: HTMLElement | null = null): Promise<void> {
      if (!scrollRoot || !this.hasMore || this.error) {
        return
      }
      if (this.prefetching || this.loading || this.loadingMore) {
        return
      }
      if (!this.needsScrollBuffer(scrollRoot)) {
        return
      }

      this.prefetching = true
      const workToken = this.backgroundWorkToken
      try {
        let loadedPages = 0
        while (this.hasMore && loadedPages < MAX_BUFFER_PAGES && workToken === this.backgroundWorkToken) {
          if (this.hasScrollBuffer(scrollRoot)) {
            break
          }
          await this.load(false, { silent: true })
          loadedPages += 1
          if (this.error) {
            break
          }
          await waitForLayout()
        }
      } finally {
        this.prefetching = false
      }
    },
    async ensureViewportFilled(
      scrollRoot: HTMLElement | null = null,
      maxPages = MAX_AUTOFILL_PAGES,
      options?: { markForEnter?: boolean; predicate?: CardPredicate },
    ): Promise<void> {
      if (!this.hasMore || this.error || this.prefetching) {
        return
      }

      this.prefetching = true
      const workToken = this.backgroundWorkToken
      try {
        let loadedPages = 0
        while (this.hasMore && loadedPages < maxPages && workToken === this.backgroundWorkToken) {
          if (!this.needsMoreVisible(scrollRoot, MIN_VISIBLE_CARDS, options?.predicate)) {
            break
          }
          await this.load(false, { markForEnter: options?.markForEnter })
          loadedPages += 1
          if (this.error) {
            break
          }
        }
      } finally {
        this.prefetching = false
      }
    },
    async bootstrap(scrollRoot: HTMLElement | null = null, predicate?: CardPredicate): Promise<void> {
      const workToken = this.backgroundWorkToken
      await this.load(true)
      if (workToken !== this.backgroundWorkToken) return
      await this.ensureViewportFilled(scrollRoot, MAX_AUTOFILL_PAGES, { predicate })
      if (workToken !== this.backgroundWorkToken) return
      await this.maintainScrollBuffer(scrollRoot)
    },
    stopBackgroundWork(): void {
      this.backgroundWorkToken += 1
      this.countScanToken += 1
      this.countingFinalCounts = false
      this.prefetching = false
    },
    async refresh(scrollRoot: HTMLElement | null = null, predicate?: CardPredicate): Promise<void> {
      await this.bootstrap(scrollRoot, predicate)
    },
    async fillAfterHide(scrollRoot: HTMLElement | null = null, predicate?: CardPredicate): Promise<void> {
      await this.ensureViewportFilled(scrollRoot, MAX_AUTOFILL_PAGES, { markForEnter: true, predicate })
      await this.maintainScrollBuffer(scrollRoot)
    },
    removeCard(dynamicId: string) {
      if (!dynamicId) {
        return
      }
      const card = this.countedCards[dynamicId] ?? this.allCards.find((item) => item.dynamicId === dynamicId)
      if (card) {
        const key = getDateGroupKey(card.publishAt)
        if (this.finalGroupCounts[key] && this.finalGroupCounts[key] > 0) {
          this.finalGroupCounts[key] -= 1
        }
        this.countedCardIds.delete(dynamicId)
        delete this.countedCards[dynamicId]
      }
      this.hiddenIds.add(dynamicId)
      this.rebuildGroups()
    },
    restoreCard(dynamicId: string, card?: VideoDynamicCard) {
      if (!dynamicId || !this.hiddenIds.has(dynamicId)) {
        return
      }
      this.hiddenIds.delete(dynamicId)
      const resolvedCard = card ?? this.allCards.find((item) => item.dynamicId === dynamicId)
      if (resolvedCard) {
        this.addCountForCard(resolvedCard)
      }
      this.rebuildGroups()
    },
    restoreAllHidden(cards: VideoDynamicCard[] = []): void {
      if (this.hiddenIds.size === 0) {
        return
      }
      const cardById = new Map(cards.map((card) => [card.dynamicId, card]))
      const restoringIds = [...this.hiddenIds]
      this.hiddenIds.clear()
      for (const dynamicId of restoringIds) {
        const card = cardById.get(dynamicId) ?? this.allCards.find((item) => item.dynamicId === dynamicId)
        if (card) {
          this.addCountForCard(card)
        }
      }
      this.rebuildGroups()
    },
    async load(reset = true, options?: { silent?: boolean; markForEnter?: boolean }) {
      if (this.loading || this.loadingMore) {
        return
      }
      if (!reset && !this.hasMore) {
        return
      }

      const silent = Boolean(options?.silent)

      if (reset) {
        this.loading = true
        this.error = null
        this.hasMore = true
        this.nextOffset = ""
        this.rawTotal = 0
        this.videoTotal = 0
        this.groups = []
        this.seenRawIds.clear()
        this.seenCardIds.clear()
        this.countedCardIds.clear()
        this.countedCards = {}
        this.allCards = []
        this.finalGroupCounts = {}
        this.countingFinalCounts = false
        this.finalCountsReady = false
        this.countScanToken += 1
      } else if (!silent) {
        this.loadingMore = true
      }

      this.error = null
      try {
        let page
        if (reset) {
          const preloaded = takeInboxFirstPagePreload()
          page =
            preloaded?.ok === true
              ? preloaded.page
              : await fetchMomentsPage(this.nextOffset)
        } else {
          page = await fetchMomentsPage(this.nextOffset)
        }
        this.nextOffset = page.nextOffset
        this.hasMore = page.hasMore

        const freshItems = page.items.filter((item) => {
          const id = typeof item.id_str === "string" ? item.id_str : ""
          if (!id || this.seenRawIds.has(id)) {
            return false
          }
          this.seenRawIds.add(id)
          return true
        })

        this.rawTotal = this.seenRawIds.size

        const freshCards = filterVideoDynamics(freshItems)
        const appendedCards: VideoDynamicCard[] = []
        for (const card of freshCards) {
          if (this.seenCardIds.has(card.dynamicId)) {
            continue
          }
          this.seenCardIds.add(card.dynamicId)
          this.allCards.push(card)
          appendedCards.push(card)
        }
        this.addCountsForCards(appendedCards)
        if (options?.markForEnter && appendedCards.length > 0) {
          this.enterAnimatedIds = [
            ...this.enterAnimatedIds,
            ...appendedCards.map((card) => card.dynamicId),
          ]
        }
        this.rebuildGroups()

        if (reset) {
          const scanToken = this.countScanToken
          void this.runFinalCountScan(this.nextOffset, scanToken)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown error"
        this.error = `加载动态失败: ${message}`
        if (reset) {
          this.groups = []
        }
      } finally {
        if (reset) {
          this.loading = false
        } else {
          this.loadingMore = false
        }
      }
    },
    async loadMore(scrollRoot: HTMLElement | null = null) {
      await this.maintainScrollBuffer(scrollRoot)
    },
  },
})
