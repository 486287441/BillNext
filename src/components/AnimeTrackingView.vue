<template>
  <section ref="trackingRoot" class="anime-tracking-view">
    <PageHeader title="我的追番" subtitle="番剧资料与封面保存在本地，观看时打开已保存的合集链接。">
      <template #actions>
        <button v-if="!adding" class="anime-header-add" type="button" @click="openAdd">＋ 添加番剧</button>
      </template>
    </PageHeader>

    <Transition name="motion-expand">
    <form v-if="adding" class="anime-editor anime-editor-add" @submit.prevent="submitAdd">
      <div class="anime-editor-heading">
        <div><strong>添加正在看的番</strong><small>名称用于查询更新；链接用于“去观看”</small></div>
        <button type="button" aria-label="关闭" @click="closeEditor">×</button>
      </div>
      <label><span>番剧名称</span><input ref="nameInputRef" v-model="draftTitle" type="text" placeholder="例如：尼古喵喵" :disabled="loading" /></label>
      <label>
        <span class="anime-link-label"><span>观看合集链接</span><button type="button" :disabled="loading || matching || !draftTitle.trim()" @click="autoMatchWatchLink">{{ matching ? "正在匹配…" : "自动匹配合集" }}</button></span>
        <input v-model="draftUrl" type="url" placeholder="B 站合集、播放列表或其他观看链接" :disabled="loading" />
      </label>
      <div v-if="matchResult" class="anime-match-result">
        <span>已选最优</span><a :href="matchResult.url" target="_blank" rel="noopener noreferrer">{{ matchResult.title }}</a>
        <small>{{ matchResult.author ? `${matchResult.author} · ` : "" }}{{ formatCount(matchResult.playCount) }}播放 · {{ formatCount(matchResult.danmakuCount) }}弹幕<span v-if="matchResult.durationSeconds"> · {{ formatDuration(matchResult.durationSeconds) }}</span></small>
      </div>
      <p v-if="matchError" class="anime-match-error">{{ matchError }}</p>
      <p class="anime-editor-hint">添加时从 Bangumi 获取并保存封面和资料；之后离线读取，集数不会自动更新。</p>
      <p v-if="error" class="anime-add-error">{{ error }}</p>
      <div class="anime-add-actions">
        <button type="button" :disabled="loading" @click="closeEditor">取消</button>
        <button class="is-primary" type="submit" :disabled="loading || matching || !draftTitle.trim() || !draftUrl.trim()">{{ matching ? "正在匹配…" : loading ? "正在查询…" : "添加并缓存" }}</button>
      </div>
    </form>

    </Transition>
    <div v-if="!items.length && !adding" class="anime-empty-state">
      <span>还没有正在追的番</span>
      <button type="button" @click="openAdd">添加第一部</button>
    </div>

    <MotionList v-else class="anime-rich-grid">
      <article v-for="item in items" :key="item.id" class="anime-rich-card" :class="{ 'has-update': hasUpdate(item) }">
        <a v-if="item.cover.startsWith('data:image/')" class="anime-poster" :href="item.sourceUrl" target="_blank" rel="noopener noreferrer" @click.prevent="$emit('open', item)">
          <img v-if="item.cover.startsWith('data:image/')" :src="coverUrl(item.cover)" :alt="item.title" loading="lazy" />
          <span v-if="hasUpdate(item)" class="anime-new-badge">NEW</span>
        </a>
        <div v-else class="anime-poster anime-cover-placeholder" role="status">
          <span>{{ coverCacheState?.[item.id] === 'pending' ? '正在缓存封面…' : '封面尚未缓存' }}</span>
          <small v-if="coverCacheState?.[item.id] && coverCacheState[item.id] !== 'pending'">{{ coverCacheState[item.id] }}</small>
          <button v-if="item.cover && coverCacheState?.[item.id] !== 'pending'" type="button" @click="$emit('retry-cover', item)">重试缓存</button>
        </div>

        <form v-if="editingId === item.id" class="anime-editor anime-card-editor" @submit.prevent="submitEdit(item)">
          <div class="anime-editor-heading"><div><strong>编辑追番</strong><small>编辑本地名称和观看链接，不请求 Bangumi</small></div></div>
          <label><span>番剧名称</span><input v-model="draftTitle" type="text" :disabled="loading" /></label>
          <label>
            <span class="anime-link-label"><span>观看合集链接</span><button type="button" :disabled="loading || matching || !draftTitle.trim()" @click="autoMatchWatchLink">{{ matching ? "正在匹配…" : "自动匹配合集" }}</button></span>
            <input v-model="draftUrl" type="url" :disabled="loading" />
          </label>
          <div v-if="matchResult" class="anime-match-result">
            <span>已选最优</span><a :href="matchResult.url" target="_blank" rel="noopener noreferrer">{{ matchResult.title }}</a>
            <small>{{ matchResult.author ? `${matchResult.author} · ` : "" }}{{ formatCount(matchResult.playCount) }}播放 · {{ formatCount(matchResult.danmakuCount) }}弹幕<span v-if="matchResult.durationSeconds"> · {{ formatDuration(matchResult.durationSeconds) }}</span></small>
          </div>
          <p v-if="matchError" class="anime-match-error">{{ matchError }}</p>
          <p v-if="error" class="anime-add-error">{{ error }}</p>
          <div class="anime-add-actions">
            <button type="button" :disabled="loading" @click="closeEditor">取消</button>
            <button class="is-primary" type="submit" :disabled="loading || matching || !draftTitle.trim() || !draftUrl.trim()">{{ matching ? "正在匹配…" : loading ? "正在同步…" : "保存" }}</button>
          </div>
        </form>

        <div v-else class="anime-rich-body">
          <div class="anime-rich-heading">
            <div>
              <h2>{{ item.title }}</h2>
            </div>
            <details class="anime-manage" name="anime-manage" @keydown.esc.prevent.stop="closeMenu($event, true)" @focusout="onMenuFocusOut">
              <summary :aria-label="`管理追番：${item.title}`" title="管理追番"><svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="3" cy="9" r="1.5" fill="currentColor" /><circle cx="9" cy="9" r="1.5" fill="currentColor" /><circle cx="15" cy="9" r="1.5" fill="currentColor" /></svg></summary>
              <div class="anime-manage-panel" role="group" aria-label="追番管理">
                <button type="button" @click="closeMenu($event); openEdit(item)">编辑追番</button>
                <a :href="item.authorUrl" target="_blank" rel="noopener noreferrer" @click="closeMenu($event)">Bangumi 资料</a>
                <button class="anime-manage-remove" type="button" :disabled="loading" @click="closeMenu($event); $emit('remove', item)">移除追番</button>
              </div>
            </details>
          </div>

          <div class="anime-progress-line">
            <span class="anime-air-status" :class="{ 'is-airing': item.airStatus === 'airing' }">{{ statusLabel(item) }}</span>
            <span aria-hidden="true">·</span>
            <span>{{ item.airedEpisodes > 0 ? `更新至 ${item.airedEpisodes}${item.totalEpisodes ? ` / ${item.totalEpisodes}` : ''} 集` : '尚未更新' }}</span>
          </div>
          <div class="anime-progress-track" :class="{ 'is-completed': item.airStatus === 'completed' }"><i :style="{ transform: `scaleX(${item.airStatus === 'completed' ? 1 : progressPercent(item) / 100})` }"></i></div>

          <div class="anime-latest-info">
            <strong>{{ item.latestEpisodeTitle }}</strong>
            <small v-if="item.updatedAt">本集更新 {{ formatScheduleDate(timestampDate(item.updatedAt)) }}</small>
            <small v-if="item.nextEpisodeDate">下集预计 {{ formatScheduleDate(item.nextEpisodeDate) }}</small>
            <small v-else-if="item.airDate">{{ statusLabel(item) }} · {{ formatDate(item.airDate) }} 开播</small>
          </div>

          <div class="anime-rich-actions">
            <button type="button" class="anime-watch-button" :disabled="!!openingId" :aria-busy="openingId === item.id" @click="$emit('open', item)">{{ openingId === item.id ? openingLabel : '去观看' }}</button>
          </div>
        </div>
      </article>
    </MotionList>
  </section>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from "vue"
import PageHeader from "./PageHeader.vue"
import MotionList from "./MotionList.vue"
import type { AnimeTrackingItem } from "../domain/anime-tracking"
import { findBestAnimeWatchLink, type AnimeWatchMatch } from "../services/anime-watch-match"

export interface AnimeEditorPayload { title: string; sourceUrl: string }

const props = defineProps<{ items: AnimeTrackingItem[]; loading: boolean; error: string; coverCacheState?: Record<string, string>; openingId?: string; openingLabel?: string }>()
const emit = defineEmits<{
  (event: "add", payload: AnimeEditorPayload): void
  (event: "edit", payload: AnimeEditorPayload & { item: AnimeTrackingItem }): void
  (event: "retry-cover", item: AnimeTrackingItem): void
  (event: "open", item: AnimeTrackingItem): void
  (event: "remove", item: AnimeTrackingItem): void
  (event: "clear-error"): void
}>()
const trackingRoot = ref<HTMLElement | null>(null)
function closeMenu(event: Event, restoreFocus = false): void {
  const menu = (event.target as HTMLElement).closest<HTMLDetailsElement>("details.anime-manage")
  if (!menu) return
  menu.open = false
  if (restoreFocus) menu.querySelector<HTMLElement>("summary")?.focus()
}
function onMenuFocusOut(event: FocusEvent): void {
  const menu = event.currentTarget as HTMLDetailsElement
  if (!menu.contains(event.relatedTarget as Node | null)) menu.open = false
}
function onOutsideMenu(event: PointerEvent): void {
  trackingRoot.value?.querySelectorAll<HTMLDetailsElement>("details.anime-manage[open]").forEach((menu) => {
    if (!menu.contains(event.target as Node)) menu.open = false
  })
}
onMounted(() => document.addEventListener("pointerdown", onOutsideMenu))
onUnmounted(() => document.removeEventListener("pointerdown", onOutsideMenu))
const adding = ref(false)
const editingId = ref("")
const draftTitle = ref("")
const draftUrl = ref("")
const nameInputRef = ref<HTMLInputElement | null>(null)
const matching = ref(false)
const matchError = ref("")
const matchResult = ref<AnimeWatchMatch | null>(null)

function resetMatch(): void { matchError.value = ""; matchResult.value = null }
function resetDraft(): void { draftTitle.value = ""; draftUrl.value = ""; resetMatch() }
function openAdd(): void {
  editingId.value = ""
  adding.value = true
  resetDraft()
  emit("clear-error")
  void nextTick(() => nameInputRef.value?.focus())
}
function openEdit(item: AnimeTrackingItem): void {
  adding.value = false
  editingId.value = item.id
  resetMatch()
  draftTitle.value = item.queryTitle || item.title
  draftUrl.value = item.sourceUrl
  emit("clear-error")
}
function closeEditor(): void { adding.value = false; editingId.value = ""; resetDraft(); emit("clear-error") }
function submitAdd(): void {
  if (!draftTitle.value.trim() || !draftUrl.value.trim()) return
  emit("add", { title: draftTitle.value.trim(), sourceUrl: draftUrl.value.trim() })
}
function submitEdit(item: AnimeTrackingItem): void {
  if (!draftTitle.value.trim() || !draftUrl.value.trim()) return
  emit("edit", { item, title: draftTitle.value.trim(), sourceUrl: draftUrl.value.trim() })
}
async function autoMatchWatchLink(): Promise<void> {
  const title = draftTitle.value.trim()
  if (!title || matching.value) return
  matching.value = true
  resetMatch()
  emit("clear-error")
  try {
    const result = await findBestAnimeWatchLink(title)
    if (draftTitle.value.trim() !== title) return
    draftUrl.value = result.url
    matchResult.value = result
  } catch (caught) {
    matchError.value = caught instanceof Error ? caught.message : "自动匹配失败"
  } finally {
    matching.value = false
  }
}
function formatCount(value: number): string {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1).replace(/\.0$/, "")}亿`
  if (value >= 10_000) return `${(value / 10_000).toFixed(1).replace(/\.0$/, "")}万`
  return String(value)
}
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor(seconds % 3600 / 60)
  const rest = Math.floor(seconds % 60)
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${minutes}:${String(rest).padStart(2, "0")}`
}
function coverUrl(value: string): string { return value ? value.replace(/^http:/, "https:") : "" }
function hasUpdate(item: AnimeTrackingItem): boolean { return Boolean(item.seenEpisodeKey && item.seenEpisodeKey !== item.latestEpisodeKey) }
function statusLabel(item: AnimeTrackingItem): string {
  return ({ airing: "连载中", completed: "已完结", upcoming: "未开播", unknown: "状态待定" })[item.airStatus]
}
function progressPercent(item: AnimeTrackingItem): number {
  if (!item.totalEpisodes) return item.airedEpisodes > 0 ? 35 : 0
  return Math.min(100, Math.round(item.airedEpisodes / item.totalEpisodes * 100))
}
function formatDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? `${Number(match[2])} 月 ${Number(match[3])} 日` : value
}
function parseLocalDate(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}
function startOfWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  return start
}
function formatScheduleDate(value: string): string {
  const date = parseLocalDate(value)
  if (!date) return formatDate(value)
  const weekOffset = Math.round((startOfWeek(date).getTime() - startOfWeek(new Date()).getTime()) / 604_800_000)
  const weekLabel = weekOffset === 0
    ? "本周"
    : weekOffset === 1
      ? "下周"
      : weekOffset === -1
        ? "上周"
        : weekOffset > 1
          ? `${weekOffset} 周后`
          : `${Math.abs(weekOffset)} 周前`
  const weekday = ["日", "一", "二", "三", "四", "五", "六"][date.getDay()]
  return `${formatDate(value)} · ${weekLabel}星期${weekday}`
}
function timestampDate(value: number): string {
  const date = new Date(value * 1000)
  if (Number.isNaN(date.getTime())) return ""
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}
watch(() => props.loading, (loading, previous) => {
  if (previous && !loading && !props.error && (adding.value || editingId.value)) closeEditor()
}, { flush: "post" })
watch(draftTitle, () => {
  if (!matching.value) resetMatch()
})
</script>
