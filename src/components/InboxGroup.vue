<template>
  <article class="group-block">
    <h2><span>{{ group.label }}</span><small>{{ displayCount }}</small></h2>
    <MotionList
      class="group-list"
      tag="div"
      @after-leave="onLeaveComplete"
      @after-enter="onEnterComplete"
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
    </MotionList>
  </article>
</template>

<script setup lang="ts">
import { computed } from "vue"
import MotionList from "./MotionList.vue"

import type { DateGroup, VideoDynamicCard } from "../domain/types"
import type { CardLeaveVariant } from "../utils/motion"
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


const displayCount = computed(() => {
  const finalCount = props.finalCountMap[props.group.key]
  return typeof finalCount === "number" ? finalCount : props.group.items.length
})

function onLeaveComplete(el: Element): void {
  const dynamicId = (el as HTMLElement).dataset.dynamicId
  if (dynamicId) emit("leave-complete", { dynamicId, groupKey: props.group.key })
}

function onEnterComplete(el: Element): void {
  const dynamicId = (el as HTMLElement).dataset.dynamicId
  if (dynamicId) emit("enter-complete", dynamicId)
}
</script>
