<template>
  <section class="live-following-view" aria-labelledby="live-following-title">
    <header class="live-following-hero">
      <div>
        <span class="live-following-eyebrow"><i></i> FOLLOWING LIVE</span>
        <h1 id="live-following-title">关注的直播</h1>
        <p>{{ heroDescription }}</p>
      </div>
      <div class="live-following-summary" aria-live="polite">
        <strong>{{ rooms.length }}</strong>
        <span>位 UP 主直播中</span>
        <button type="button" :disabled="loading" title="刷新直播列表" @click="$emit('refresh')">
          <Icon icon="mingcute:refresh-2-line" :class="{ 'is-spinning': loading }" />
          <span>刷新</span>
        </button>
      </div>
    </header>

    <div v-if="loading && !rooms.length" class="live-following-grid" aria-label="正在加载直播">
      <article v-for="index in 8" :key="index" class="live-card live-card-skeleton"><i></i><span></span><small></small></article>
    </div>

    <div v-else-if="error" class="live-following-state is-error">
      <span class="live-state-icon"><Icon icon="mingcute:wifi-off-line" /></span>
      <strong>直播列表暂时走丢了</strong>
      <p>{{ error }}</p>
      <button type="button" @click="$emit('refresh')">重新加载</button>
    </div>

    <div v-else-if="!rooms.length" class="live-following-state">
      <span class="live-state-icon"><Icon icon="mingcute:moon-stars-line" /></span>
      <strong>现在还没有人开播</strong>
      <p>关注的 UP 主开播后，会第一时间出现在这里。</p>
      <button type="button" @click="$emit('refresh')">再看看</button>
    </div>

    <TransitionGroup v-else class="live-following-grid" tag="div" name="live-card">
      <article v-for="room in rooms" :key="room.roomId" class="live-card">
        <a class="live-card-cover" :href="room.url" target="_blank" rel="noopener noreferrer">
          <img v-if="room.cover" :src="coverUrl(room.cover)" :alt="room.title" loading="lazy" />
          <span v-else class="live-card-cover-fallback"><Icon icon="mingcute:live-line" /></span>
          <span class="live-card-status"><i></i> 直播中</span>
          <span class="live-card-online"><Icon icon="mingcute:user-3-line" />{{ formatCount(room.online) }}</span>
          <span class="live-card-enter"><Icon icon="mingcute:play-fill" />进入直播间</span>
        </a>
        <div class="live-card-info">
          <a class="live-card-avatar" :href="spaceUrl(room.upMid)" target="_blank" rel="noopener noreferrer">
            <img v-if="room.upAvatar" :src="avatarUrl(room.upAvatar)" :alt="room.upName" loading="lazy" />
            <Icon v-else icon="mingcute:user-3-line" />
          </a>
          <div>
            <a class="live-card-title" :href="room.url" target="_blank" rel="noopener noreferrer" :title="room.title">{{ room.title }}</a>
            <p><a :href="spaceUrl(room.upMid)" target="_blank" rel="noopener noreferrer">{{ room.upName }}</a><span>{{ room.areaName }}</span></p>
          </div>
        </div>
      </article>
    </TransitionGroup>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue"
import { Icon } from "@iconify/vue"
import type { LiveRoomCard } from "../domain/types"

const props = defineProps<{ rooms: LiveRoomCard[]; loading: boolean; error: string }>()
defineEmits<{ (event: "refresh"): void }>()

const heroDescription = computed(() => props.loading && props.rooms.length
  ? "正在确认谁刚刚开播…"
  : props.rooms.length
    ? "不用在信息流里找，喜欢的直播都在这里。"
    : "开播的人会聚在这里，空闲时回来看看。")

function coverUrl(url: string): string { return /hdslb\.com/i.test(url) ? `${url}@672w_378h_1c` : url }
function avatarUrl(url: string): string { return /hdslb\.com/i.test(url) ? `${url}@64w_64h_1c_1s` : url }
function spaceUrl(mid: string): string { return mid ? `https://space.bilibili.com/${mid}` : "https://space.bilibili.com/" }
function formatCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0"
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1).replace(/\.0$/, "")}亿`
  if (value >= 10_000) return `${(value / 10_000).toFixed(1).replace(/\.0$/, "")}万`
  return String(value)
}
</script>
