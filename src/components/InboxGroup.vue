<template>
  <article class="group-block" ref="groupRef">
    <h2><span>{{ group.label }}</span><small>{{ displayCount }}</small></h2>
    <TransitionGroup
      class="group-list"
      tag="div"
      :css="false"
      @leave="onLeave"
    >
      <VideoCard
        v-for="item in group.items"
        :key="item.dynamicId"
        :card="item"
        :pending-map="pendingMap"
        :want-watch-map="wantWatchMap"
        :open-video-on-want-watch="openVideoOnWantWatch"
        :hover-autoplay="hoverAutoplay"
        :following-up-map="followingUpMap"
        :relation-pending-mid="relationPendingMid"
        :transcriber-state="transcriberMap[item.dynamicId]"
        @want-watch="$emit('want-watch', item)"
        @help-read="$emit('help-read', item)"
        @dislike="$emit('dislike', item)"
        @toggle-follow="$emit('toggle-follow', item)"
      />
    </TransitionGroup>
  </article>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue"

import type { DateGroup, VideoDynamicCard } from "../domain/types"
import {
  animateGridReflow,
  captureCardRects,
  fadeSlideIn,
  motionEnabled,
  resetCardLeaveStyles,
  type CardLeaveVariant,
} from "../utils/motion"
import VideoCard from "./VideoCard.vue"
import type { TranscriberCardState } from "../store/transcriber"

const props = defineProps<{
  group: DateGroup
  pendingMap: Record<string, boolean>
  wantWatchMap: Record<string, boolean>
  openVideoOnWantWatch: boolean
  hoverAutoplay: boolean
  followingUpMap: Record<string, boolean>
  relationPendingMid: string
  finalCountMap: Record<string, number>
  leaveReasonMap: Record<string, CardLeaveVariant>
  enterCardIds: string[]
  transcriberMap: Record<string, TranscriberCardState | undefined>
}>()

const emit = defineEmits<{
  (event: "want-watch", card: VideoDynamicCard): void
  (event: "dislike", card: VideoDynamicCard): void
  (event: "toggle-follow", card: VideoDynamicCard): void
  (event: "help-read", card: VideoDynamicCard): void
  (event: "leave-complete", payload: { dynamicId: string; groupKey: string }): void
  (event: "enter-complete", dynamicId: string): void
}>()

const groupRef = ref<HTMLElement | null>(null)
const knownCardIds = ref<string[]>([])

const displayCount = computed(() => {
  const finalCount = props.finalCountMap[props.group.key]
  return typeof finalCount === "number" ? finalCount : props.group.items.length
})

function finishLeave(htmlEl: HTMLElement, dynamicId: string, done: () => void): void {
  const listEl = htmlEl.parentElement
  const beforeRects = listEl ? captureCardRects(listEl, htmlEl) : null

  resetCardLeaveStyles(htmlEl)
  done()

  const notifyComplete = (): void => {
    if (dynamicId) {
      emit("leave-complete", { dynamicId, groupKey: props.group.key })
    }
  }

  if (listEl && beforeRects && beforeRects.size > 0) {
    void nextTick(() => {
      animateGridReflow(listEl, beforeRects, notifyComplete)
    })
    return
  }

  notifyComplete()
}

function onLeave(el: Element, done: () => void): void {
  const htmlEl = el as HTMLElement
  const dynamicId = htmlEl.dataset.dynamicId ?? ""

  // The card itself leaves immediately; the single grid reflow below carries
  // the state change without drawing attention to the dismissed item.
  finishLeave(htmlEl, dynamicId, done)
}

function animateFillInCards(items: VideoDynamicCard[]): void {
  if (!motionEnabled() || items.length === 0 || !groupRef.value) {
    for (const item of items) {
      emit("enter-complete", item.dynamicId)
    }
    return
  }

  void nextTick(() => {
    if (!groupRef.value) {
      return
    }
    let pending = items.length
    const finishOne = (dynamicId: string): void => {
      emit("enter-complete", dynamicId)
      pending -= 1
    }

    for (const [index, item] of items.entries()) {
      const cardEl = groupRef.value.querySelector<HTMLElement>(`[data-dynamic-id="${item.dynamicId}"]`)
      if (!cardEl) {
        finishOne(item.dynamicId)
        continue
      }
      fadeSlideIn(cardEl, {
        y: 6,
        duration: 0.2,
        delay: Math.min(index, 3) * 0.035,
        onComplete: () => finishOne(item.dynamicId),
      })
    }
  })
}

watch(
  () => props.group.items,
  (items) => {
    const known = new Set(knownCardIds.value)
    const fillInItems = items.filter((item) => !known.has(item.dynamicId))
    knownCardIds.value = items.map((item) => item.dynamicId)

    if (fillInItems.length > 0) {
      animateFillInCards(fillInItems)
    }
  },
  { flush: "post" },
)

knownCardIds.value = props.group.items.map((item) => item.dynamicId)
</script>
