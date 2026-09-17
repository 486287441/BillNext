import { defineStore } from "pinia"

import { shouldPromptUnfollow } from "../domain/decision-rules"
import type { VideoDynamicCard } from "../domain/types"
import { getVideoIdentity } from "../domain/video-identity"
import { fetchFollowingRelations, followUp, removeVideoFromWatchLater, saveToWatchLater, submitOfficialDislike, unfollowUp } from "../services/bilibili-api"
import { readPersistedState, writePersistedState } from "../services/storage"
import { showToast } from "../services/toast"
import { useInboxStore } from "./inbox"
import { useTrashStore } from "./trash"

const persistedState = readPersistedState()

export const useDecisionStore = defineStore("decision", {
  state: () => ({
    pendingMap: {} as Record<string, boolean>,
    dislikedIds: new Set(persistedState.dislikedDynamicIds),
    wantWatchIds: new Set(persistedState.wantWatchDynamicIds),
    wantWatchCards: [...persistedState.wantWatchCards] as VideoDynamicCard[],
    upDislikeCounts: { ...persistedState.upDislikeCounts } as Record<string, number>,
    promptingUpMid: "",
    unfollowingUpMid: "",
    followingUpMap: {} as Record<string, boolean>,
    relationPendingMid: "",
    relationLookupMids: new Set<string>(),
  }),
  actions: {
    isWantWatch(card: VideoDynamicCard): boolean {
      const identity = getVideoIdentity(card)
      return this.wantWatchIds.has(card.dynamicId)
        || this.wantWatchCards.some((item) => getVideoIdentity(item) === identity)
    },
    isDisliked(card: VideoDynamicCard): boolean {
      if (this.dislikedIds.has(card.dynamicId)) return true
      const identity = getVideoIdentity(card)
      return useTrashStore().items.some((item) => getVideoIdentity(item.card) === identity)
    },
    syncWatchLaterCards(cards: VideoDynamicCard[]): void {
      this.wantWatchCards = [...cards]
      this.wantWatchIds = new Set(cards.map((card) => card.dynamicId))
      writePersistedState({
        wantWatchDynamicIds: [...this.wantWatchIds],
        wantWatchCards: this.wantWatchCards,
      })
    },
    forgetWatchLater(card: VideoDynamicCard): void {
      const identity = getVideoIdentity(card)
      const matchingIds = new Set(
        this.wantWatchCards
          .filter((item) => getVideoIdentity(item) === identity)
          .map((item) => item.dynamicId),
      )
      matchingIds.add(card.dynamicId)
      this.wantWatchCards = this.wantWatchCards.filter((item) => getVideoIdentity(item) !== identity)
      this.wantWatchIds = new Set([...this.wantWatchIds].filter((id) => !matchingIds.has(id)))
      writePersistedState({
        wantWatchDynamicIds: [...this.wantWatchIds],
        wantWatchCards: this.wantWatchCards,
      })
    },
    async ensureFollowingStatuses(cards: VideoDynamicCard[]): Promise<void> {
      const missing = [...new Set(cards.map((card) => card.upMid).filter(Boolean))]
        .filter((mid) => this.followingUpMap[mid] === undefined && !this.relationLookupMids.has(mid))
      if (missing.length === 0) return
      for (const mid of missing) this.relationLookupMids.add(mid)
      try {
        for (let index = 0; index < missing.length; index += 50) {
          const batch = missing.slice(index, index + 50)
          const relations = await fetchFollowingRelations(batch)
          this.followingUpMap = { ...this.followingUpMap, ...relations }
        }
      } catch {
        // 关注状态加载失败不影响视频流；下次出现这些卡片时允许重试。
      } finally {
        for (const mid of missing) this.relationLookupMids.delete(mid)
      }
    },

    async toggleFollowCreator(upMid: string, upName: string): Promise<boolean> {
      if (!upMid || this.relationPendingMid) return false
      const isFollowing = this.followingUpMap[upMid] === true
      const displayName = upName || "该 UP"
      if (isFollowing && !window.confirm(`确认取消关注 ${displayName}？`)) return false
      this.relationPendingMid = upMid
      try {
        if (isFollowing) await unfollowUp(upMid)
        else await followUp(upMid)
        this.followingUpMap = { ...this.followingUpMap, [upMid]: !isFollowing }
        showToast(isFollowing ? `已取消关注 ${displayName}` : `已关注 ${displayName}`)
        return true
      } catch (error) {
        const message = error instanceof Error ? error.message : "未知错误"
        showToast(`${isFollowing ? "取消关注" : "关注"}失败：${message}`, "error")
        return false
      } finally {
        this.relationPendingMid = ""
      }
    },
    syncWantWatchCards(cards: VideoDynamicCard[]): void {
      const knownDynamicIds = new Set(this.wantWatchCards.map((item) => item.dynamicId))
      let changed = false
      for (const card of cards) {
        if (!this.wantWatchIds.has(card.dynamicId) || knownDynamicIds.has(card.dynamicId)) {
          continue
        }
        this.wantWatchCards.push(card)
        knownDynamicIds.add(card.dynamicId)
        changed = true
      }
      if (changed) {
        writePersistedState({ wantWatchCards: this.wantWatchCards })
      }
    },

    async markWantWatch(card: VideoDynamicCard): Promise<void> {
      if (!card.dynamicId || this.pendingMap[card.dynamicId]) {
        return
      }

      if (this.isWantWatch(card)) {
        showToast("已在稍后再看")
        return
      }

      this.pendingMap[card.dynamicId] = true
      try {
        await saveToWatchLater(card)
        this.wantWatchIds.add(card.dynamicId)
        const existingIndex = this.wantWatchCards.findIndex((item) => item.dynamicId === card.dynamicId)
        if (existingIndex >= 0) {
          this.wantWatchCards.splice(existingIndex, 1)
        }
        this.wantWatchCards.push(card)
        writePersistedState({
          wantWatchDynamicIds: [...this.wantWatchIds],
          wantWatchCards: this.wantWatchCards,
        })
        showToast("已加入稍后再看")
      } catch (error) {
        const message = error instanceof Error ? error.message : "未知错误"
        showToast(`加入稍后再看失败：${message}`, "error")
      } finally {
        this.pendingMap[card.dynamicId] = false
      }
    },
    async markDislike(card: VideoDynamicCard, mode: "local" | "home-recommendation" = "local"): Promise<boolean> {
      if (!card.dynamicId) {
        return false
      }
      if (this.isDisliked(card) || this.pendingMap[card.dynamicId]) {
        return false
      }
      this.pendingMap[card.dynamicId] = true
      const submitOfficialFeedback = mode === "home-recommendation"
      const removeFromWatchLater = this.isWantWatch(card)
      let officialFeedbackError = ""
      let watchLaterError = ""
      if (removeFromWatchLater) {
        try {
          await removeVideoFromWatchLater(card)
          this.forgetWatchLater(card)
        } catch (error) {
          watchLaterError = error instanceof Error ? error.message : "未知错误"
        }
      }
      if (submitOfficialFeedback) {
        try {
          // 只有接口明确返回 code === 0 时 submitOfficialDislike 才会成功返回。
          await submitOfficialDislike(card)
        } catch (error) {
          officialFeedbackError = error instanceof Error ? error.message : "未知错误"
        }
      }
      this.dislikedIds.add(card.dynamicId)
      if (submitOfficialFeedback && card.upMid) {
        this.upDislikeCounts[card.upMid] = (this.upDislikeCounts[card.upMid] ?? 0) + 1
      }

      const trash = useTrashStore()
      trash.add(card)

      writePersistedState({
        dislikedDynamicIds: [...this.dislikedIds],
        trashItems: trash.items,
        upDislikeCounts: this.upDislikeCounts,
      })

      const inbox = useInboxStore()
      inbox.removeCard(card.dynamicId)
      this.pendingMap[card.dynamicId] = false

      if (watchLaterError) {
        showToast(`已移入垃圾箱；移出稍后再看失败：${watchLaterError}`, "error")
      } else if (!submitOfficialFeedback) {
        showToast(removeFromWatchLater ? "已移出稍后再看并移入垃圾箱" : "已移入垃圾箱")
      } else if (officialFeedbackError) {
        const watchLaterMessage = removeFromWatchLater ? "、已移出稍后再看" : ""
        showToast(`已移入垃圾箱${watchLaterMessage}；B 站不感兴趣提交失败：${officialFeedbackError}`, "error")
      } else {
        showToast(removeFromWatchLater ? "已移出稍后再看、移入垃圾箱，并提交 B 站不感兴趣" : "已移入垃圾箱，并成功提交 B 站不感兴趣")
      }

      if (submitOfficialFeedback && card.upMid) {
        void this.maybePromptUnfollow(card.upMid, card.upName)
      }
      return true
    },
    restoreDisliked(card: VideoDynamicCard): void {
      if (!card.dynamicId) {
        return
      }
      this.dislikedIds.delete(card.dynamicId)
      const trash = useTrashStore()
      trash.remove(card.dynamicId)
      writePersistedState({
        dislikedDynamicIds: [...this.dislikedIds],
        trashItems: trash.items,
        upDislikeCounts: this.upDislikeCounts,
      })
    },
    clearAllDisliked(): void {
      if (this.dislikedIds.size === 0) {
        return
      }
      this.dislikedIds.clear()
      const trash = useTrashStore()
      trash.clearAll()
      writePersistedState({
        dislikedDynamicIds: [],
        trashItems: [],
        upDislikeCounts: this.upDislikeCounts,
      })
    },
    async maybePromptUnfollow(upMid: string, upName: string): Promise<void> {
      if (!upMid || this.promptingUpMid === upMid) {
        return
      }
      const count = this.upDislikeCounts[upMid] ?? 0
      if (!shouldPromptUnfollow(count)) {
        return
      }

      this.promptingUpMid = upMid
      try {
        const displayName = upName || "该 UP"
        const confirmed = window.confirm(
          `你已连续 ${count} 次对 ${displayName} 点“不想看”，是否现在取消关注？`,
        )
        if (!confirmed) {
          return
        }
        await unfollowUp(upMid)
        showToast(`已取消关注 ${displayName}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : "未知错误"
        showToast(`取消关注失败：${message}`, "error")
      } finally {
        this.promptingUpMid = ""
      }
    },
    async unfollowCreator(upMid: string, upName: string): Promise<boolean> {
      if (!upMid || this.unfollowingUpMid) {
        return false
      }

      const displayName = upName || "该 UP"
      const confirmed = window.confirm(`确认取消关注 ${displayName}？`)
      if (!confirmed) {
        return false
      }

      this.unfollowingUpMid = upMid
      try {
        await unfollowUp(upMid)
        showToast(`已取消关注 ${displayName}`)
        return true
      } catch (error) {
        const message = error instanceof Error ? error.message : "未知错误"
        showToast(`取消关注失败：${message}`, "error")
        return false
      } finally {
        this.unfollowingUpMid = ""
      }
    },
  },
})
