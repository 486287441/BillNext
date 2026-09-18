<template>
  <section class="checklist-view">
    <header class="page-header"><div class="page-header-copy"><span class="page-header-eyebrow">CHECKLIST</span><h1>我的片单</h1></div></header>
    <div class="checklist-control-deck">
      <div class="checklist-tabs" role="tablist" aria-label="选择榜单">
        <button v-for="definition in definitions" :key="definition.kind" type="button" role="tab" :aria-selected="activeKind === definition.kind" :class="{ active: activeKind === definition.kind }" @click="selectKind(definition.kind)">
          <span>{{ definition.title }}</span>
        </button>
      </div>

      <div class="checklist-progress-card">
        <div class="checklist-progress-copy">
          <span><small>{{ activeDefinition.description }}</small></span>
          <b>{{ watchedCount }} / {{ activeDefinition.total }} · {{ progressPercent }}%</b>
        </div>
        <div class="checklist-progress-track" role="progressbar" :aria-valuenow="watchedCount" aria-valuemin="0" :aria-valuemax="activeDefinition.total"><i :style="{ transform: `scaleX(${progressPercent / 100})` }"></i></div>
      </div>

      <div class="checklist-filter-toolbar" aria-label="清单筛选">
        <div class="checklist-filter-options">
        <div class="checklist-filter-group">
          <span>观看</span>
          <div class="checklist-filter-segment" role="group" aria-label="观看状态">
            <button v-for="option in watchOptions" :key="option.value" type="button" :class="{ active: watchFilter === option.value }" :aria-pressed="watchFilter === option.value" @click="watchFilter = option.value">{{ option.label }}</button>
          </div>
        </div>
        <div v-if="activeKind !== 'bangumi'" class="checklist-filter-group">
          <span>片源</span>
          <div class="checklist-filter-segment" role="group" aria-label="B站官方片源">
            <button v-for="option in presenceOptions" :key="option.value" type="button" :class="{ active: biliPresence === option.value }" :aria-pressed="biliPresence === option.value" @click="setBiliPresence(option.value)">{{ option.label }}</button>
          </div>
        </div>
        <div v-if="activeKind !== 'bangumi'" class="checklist-filter-group checklist-version-group">
          <span>版本</span>
          <div class="checklist-filter-segment" role="group" aria-label="B站版本判断">
            <button v-for="option in completenessOptions" :key="option.value" type="button" :class="{ active: biliCompleteness === option.value }" :aria-pressed="biliCompleteness === option.value" @click="setBiliCompleteness(option.value)">{{ option.label }}</button>
          </div>
        </div>
        <button v-if="hasAnyFilter" type="button" class="checklist-filter-reset" aria-label="清除全部筛选" @click="resetAllFilters"><Icon icon="mingcute:close-line" />重置</button>
        </div>
        <small role="status">{{ hasAnyFilter ? `筛选结果 ${visibleItems.length} 部` : `共 ${visibleItems.length} 部` }}</small>
      </div>
    </div>

    <div v-if="fallback" class="checklist-notice">
      <span><Icon icon="mingcute:information-line" /><b>完整榜单加载失败，当前展示内置精选。</b><small v-if="loadError">{{ loadError }}</small></span>
      <button type="button" :disabled="loading" @click="load(true)">重新加载</button>
    </div>

    <div v-if="loading && !items.length" class="checklist-poster-grid" aria-label="正在加载榜单">
      <div v-for="index in 10" :key="index" class="checklist-skeleton"><i></i><span></span><span></span></div>
    </div>
    <div v-else-if="!visibleItems.length" class="checklist-empty">
      <Icon icon="mingcute:filter-line" /><strong>当前筛选下没有作品</strong><button type="button" @click="resetAllFilters">显示全部</button>
    </div>
    <MotionList v-else class="checklist-poster-grid" tag="div" name="checklist-card">
      <article v-for="item in visibleItems" :key="itemKey(item)" class="checklist-card" :class="{ watched: isWatched(item) }">
        <div class="checklist-poster-wrap">
        <a class="checklist-poster" :href="posterUrl(item)" :aria-label="posterLinkLabel(item)" target="_blank" rel="noopener noreferrer">
          <img v-if="item.poster" :src="item.poster" :alt="item.title" loading="lazy" />
          <span v-else class="checklist-poster-fallback"><b>{{ titleInitial(item.title) }}</b><small>{{ item.originalTitle || activeDefinition.shortTitle }}</small></span>
          <strong class="checklist-rank"><i>#</i>{{ item.rank }}</strong>
          <span v-if="item.rating" class="checklist-score"><Icon icon="mingcute:star-fill" />{{ item.rating.toFixed(1) }}</span>
        </a>
        <button class="checklist-watch-toggle" type="button" :class="{ 'is-watched': isWatched(item) }" :aria-pressed="isWatched(item)" :aria-label="`${isWatched(item) ? '取消已看' : '标记看过'}：${item.title}`" :title="isWatched(item) ? '已看 · 点击取消' : '标记看过'" @click="toggleWatched(item)"><Icon :icon="isWatched(item) ? 'mingcute:check-fill' : 'mingcute:round-line'" /></button>
        </div>
        <div class="checklist-card-body">
          <h2 :title="item.title">{{ item.title }}</h2>
          <p v-if="item.originalTitle && item.originalTitle !== item.title" :title="item.originalTitle">{{ item.originalTitle }}</p>
          <div class="checklist-meta"><span v-if="item.year">{{ item.year }}</span><span v-if="item.director">{{ item.director }}</span></div>
          <div v-if="item.kind !== 'bangumi'" class="checklist-bili-status" :class="availabilityClass(item)" :title="[completenessLabel(item), availabilityFor(item)?.note].filter(Boolean).join(' · ')">
            <span v-if="isChecking(item)"><Icon icon="mingcute:loading-3-line" />正在确认 B站片源</span>
            <template v-else-if="availabilityFor(item)?.status === 'available'">
              <a :href="availabilityFor(item)?.biliUrl" target="_blank" rel="noopener noreferrer"><Icon icon="mingcute:play-circle-fill" />B站可看</a>
            </template>
            <span v-else-if="availabilityFor(item)?.status === 'unavailable'"><Icon icon="mingcute:close-circle-line" />B站暂无官方片源</span>
            <span v-else><Icon icon="mingcute:warning-line" />{{ availabilityFor(item) ? "确认失败，将自动重试" : "正在读取确认结果" }}</span>
          </div>
        </div>
      </article>
    </MotionList>
  </section>
</template>

<script setup lang="ts">
import MotionList from "./MotionList.vue"
import { Icon } from "@iconify/vue"
import { computed, onMounted, onUnmounted, ref } from "vue"
import { CHECKLIST_DEFINITIONS, checklistFingerprint, checklistItemKey, type ChecklistAvailability, type ChecklistItem, type ChecklistKind } from "../domain/checklist"
import { fetchChecklist } from "../services/checklist"
import { checkBilibiliAvailability, hydrateAvailabilityVersion, isAvailabilityFresh, reuseAvailability } from "../services/checklist-availability"

const props = defineProps<{ watchedIds: string[]; availabilityMap?: Record<string, ChecklistAvailability> }>()
const emit = defineEmits<{
  (event: "update:watchedIds", value: string[]): void
  (event: "availability", value: ChecklistAvailability): void
}>()
const definitions = CHECKLIST_DEFINITIONS
const activeKind = ref<ChecklistKind>("imdb")
const items = ref<ChecklistItem[]>([])
const loadedByKind = new Map<ChecklistKind, ChecklistItem[]>()
const loading = ref(false)
const fallback = ref(false)
const loadError = ref("")
type WatchFilter = "all" | "watched" | "unwatched"
type BiliPresenceFilter = "all" | "available" | "unavailable"
type BiliCompletenessFilter = "all" | "runtime_match" | "possibly_cut"
const watchOptions: Array<{ value: WatchFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "watched", label: "已看" },
  { value: "unwatched", label: "未看" },
]
const presenceOptions: Array<{ value: BiliPresenceFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "available", label: "可看" },
  { value: "unavailable", label: "没有" },
]
const completenessOptions: Array<{ value: BiliCompletenessFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "runtime_match", label: "未删减" },
  { value: "possibly_cut", label: "已删减" },
]
const watchFilter = ref<WatchFilter>("all")
const biliPresence = ref<BiliPresenceFilter>("all")
const biliCompleteness = ref<BiliCompletenessFilter>("all")
const checkingKeys = ref(new Set<string>())
const checkQueue: ChecklistItem[] = []
const queuedKeys = new Set<string>()
const versionQueue: ChecklistItem[] = []
const versionQueuedKeys = new Set<string>()
let activeVersionWorkers = 0
const VERSION_WORKER_COUNT = 4
let processingChecks = false
let stopped = false
const watchedSet = computed(() => new Set(props.watchedIds))
const activeDefinition = computed(() => definitions.find((item) => item.kind === activeKind.value) ?? definitions[0])
const watchedCount = computed(() => props.watchedIds.filter((id) => id.startsWith(`${activeKind.value}:`)).length)
const progressPercent = computed(() => Math.min(100, Math.round(watchedCount.value / activeDefinition.value.total * 100)))
const hasAnyFilter = computed(() => watchFilter.value !== "all" || (activeKind.value !== "bangumi" && (biliPresence.value !== "all" || biliCompleteness.value !== "all")))
const visibleItems = computed(() => items.value.filter((item) => {
  if (watchFilter.value === "watched" && !isWatched(item)) return false
  if (watchFilter.value === "unwatched" && isWatched(item)) return false
  if (item.kind === "bangumi") return true
  const availability = availabilityFor(item)
  if (biliPresence.value !== "all" && availability?.status !== biliPresence.value) return false
  if (biliCompleteness.value !== "all" && availability?.status !== "available") return false
  if (biliCompleteness.value !== "all" && availability?.completeness !== biliCompleteness.value) return false
  return true
}))


function itemKey(item: ChecklistItem): string { return checklistItemKey(item.kind, item.id) }
function isWatched(item: ChecklistItem): boolean { return watchedSet.value.has(itemKey(item)) }
function availabilityFor(item: ChecklistItem): ChecklistAvailability | undefined { return props.availabilityMap?.[itemKey(item)] }
function isChecking(item: ChecklistItem): boolean { return checkingKeys.value.has(itemKey(item)) }
function titleInitial(title: string): string { return Array.from(title.trim())[0]?.toLocaleUpperCase() || "影" }
function posterUrl(item: ChecklistItem): string {
  const availability = availabilityFor(item)
  if (item.kind === "bangumi") return `https://search.bilibili.com/all?keyword=${encodeURIComponent(item.title)}`
  if (availability?.status === "available" && availability.biliUrl) return availability.biliUrl
  if (availability?.status === "unavailable") return `https://search.bilibili.com/all?keyword=${encodeURIComponent(item.title)}`
  return item.url
}
function posterLinkLabel(item: ChecklistItem): string {
  const availability = availabilityFor(item)
  if (item.kind === "bangumi") return `在B站搜索《${item.title}》`
  if (availability?.status === "available" && availability.biliUrl) return `在B站观看《${item.title}》`
  if (availability?.status === "unavailable") return `在B站搜索《${item.title}》`
  return `查看《${item.title}》榜单详情`
}
function minutes(seconds: number): number { return Math.max(1, Math.round(seconds / 60)) }
function completenessLabel(item: ChecklistItem): string {
  const value = availabilityFor(item)
  if (!value) return "正在读取确认结果"
  const times = value.referenceRuntimeSeconds && value.biliRuntimeSeconds ? `B站 ${minutes(value.biliRuntimeSeconds)} 分钟 · 完整版 ${minutes(value.referenceRuntimeSeconds)} 分钟` : ""
  if (value.completeness === "runtime_match") return "未删减"
  if (value.completeness === "possibly_cut" || value.completeness === "runtime_differs") return `已删减 · ${times}`
  if (value.completeness === "unverifiable") return "已确认片源 · 无时长数据"
  return "版本确认失败"
}
function availabilityClass(item: ChecklistItem): string {
  if (isChecking(item)) return "is-checking"
  const value = availabilityFor(item)
  if (!value) return "is-unknown"
  if (value.status === "unavailable") return "is-unavailable"
  if (value.completeness === "possibly_cut" || value.completeness === "runtime_differs") return "is-warning"
  return value.status === "available" ? "is-available" : "is-unknown"
}
function toggleWatched(item: ChecklistItem): void {
  const key = itemKey(item)
  const next = new Set(props.watchedIds)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  emit("update:watchedIds", [...next])
}
function resetAllFilters(): void {
  watchFilter.value = "all"
  biliPresence.value = "all"
  biliCompleteness.value = "all"
}
function setBiliPresence(value: BiliPresenceFilter): void {
  biliPresence.value = value
  if (value === "unavailable") biliCompleteness.value = "all"
}
function setBiliCompleteness(value: BiliCompletenessFilter): void {
  biliCompleteness.value = value
  if (value !== "all") biliPresence.value = "available"
}
async function load(force = false): Promise<void> {
  if (loading.value) return
  const cached = !force ? loadedByKind.get(activeKind.value) : undefined
  if (cached) { items.value = cached; fallback.value = false; loadError.value = ""; return }
  loading.value = true
  const requestedKind = activeKind.value
  try {
    const result = await fetchChecklist(requestedKind, force)
    if (activeKind.value !== requestedKind) return
    items.value = result.items
    fallback.value = result.fallback
    loadError.value = result.error
    if (!result.fallback) loadedByKind.set(requestedKind, result.items)
    enqueueAvailabilityChecks(result.items)
  } finally {
    loading.value = false
  }
}

function setChecking(key: string, checking: boolean): void {
  const next = new Set(checkingKeys.value)
  if (checking) next.add(key)
  else next.delete(key)
  checkingKeys.value = next
}

function reusableResult(item: ChecklistItem): ChecklistAvailability | undefined {
  const fingerprint = checklistFingerprint(item)
  return Object.values(props.availabilityMap ?? {}).find((value) => value.fingerprint === fingerprint && isAvailabilityFresh(value) && value.status !== "unknown")
}

function enqueueAvailabilityChecks(nextItems: ChecklistItem[]): void {
  for (const item of nextItems) {
    if (item.kind === "bangumi") continue
    const key = itemKey(item)
    const current = props.availabilityMap?.[key]
    if (isAvailabilityFresh(current)) {
      if (current) {
        const normalized = reuseAvailability(item, current)
        if (normalized.completeness !== current.completeness
          || normalized.referenceRuntimeSeconds !== current.referenceRuntimeSeconds
          || normalized.note !== current.note) {
          emit("availability", normalized)
        }
      }
      const legacyOfficialPage = current?.status === "unavailable"
        && current.note === "B站官方页面存在，但当前未提供可播放正片"
        && Boolean(current.biliUrl)
      if (((current?.status === "available" && current.completeness === "unknown") || legacyOfficialPage) && !versionQueuedKeys.has(key)) {
        versionQueuedKeys.add(key)
        versionQueue.push(item)
      }
      continue
    }
    if (queuedKeys.has(key)) continue
    const reusable = reusableResult(item)
    if (reusable) {
      emit("availability", reuseAvailability(item, reusable))
      continue
    }
    queuedKeys.add(key)
    checkQueue.push(item)
  }
  void processAvailabilityQueue()
  processVersionQueue()
}

function processVersionQueue(): void {
  while (!stopped && activeVersionWorkers < VERSION_WORKER_COUNT && versionQueue.length) {
    const item = versionQueue.shift()
    if (!item) return
    const key = itemKey(item)
    activeVersionWorkers += 1
    setChecking(key, true)
    void (async () => {
      try {
        const current = props.availabilityMap?.[key]
        const legacyOfficialPage = current?.status === "unavailable"
          && current.note === "B站官方页面存在，但当前未提供可播放正片"
          && Boolean(current.biliUrl)
        if ((current?.status === "available" && current.completeness === "unknown") || legacyOfficialPage) {
          const hydrated = await hydrateAvailabilityVersion(item, current)
          if (!stopped) emit("availability", hydrated)
        }
      } finally {
        versionQueuedKeys.delete(key)
        setChecking(key, false)
        activeVersionWorkers -= 1
        processVersionQueue()
      }
    })()
  }
}

async function processAvailabilityQueue(): Promise<void> {
  if (processingChecks || stopped) return
  processingChecks = true
  while (checkQueue.length && !stopped) {
    const item = checkQueue.shift()
    if (!item) break
    const key = itemKey(item)
    const reusable = reusableResult(item)
    if (reusable) {
      emit("availability", reuseAvailability(item, reusable))
      queuedKeys.delete(key)
      continue
    }
    setChecking(key, true)
    try {
      const checked = await checkBilibiliAvailability(item)
      if (!stopped) emit("availability", checked)
    } finally {
      queuedKeys.delete(key)
      setChecking(key, false)
    }
    await new Promise((resolve) => window.setTimeout(resolve, 450))
  }
  processingChecks = false
}

async function preloadFilmLists(): Promise<void> {
  for (const kind of ["imdb", "douban"] as const) {
    if (stopped || loadedByKind.has(kind)) continue
    const result = await fetchChecklist(kind)
    if (!result.fallback) loadedByKind.set(kind, result.items)
    enqueueAvailabilityChecks(result.items)
  }
}
function selectKind(kind: ChecklistKind): void {
  if (activeKind.value === kind) return
  activeKind.value = kind
  items.value = loadedByKind.get(kind) ?? []
  fallback.value = false
  void load()
}
onMounted(() => {
  void load().then(() => window.setTimeout(() => void preloadFilmLists(), 900))
})
onUnmounted(() => { stopped = true })
</script>
