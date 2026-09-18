<template>
  <header ref="toolbarRef" class="workspace-toolbar" :class="{ 'is-search-only': searchOnly, 'is-scroll-hidden': toolbarHidden }" aria-label="全局工具栏" @focusin="toolbarHidden = false">
    <form class="workspace-global-search" :class="{ 'is-scoped-search': isScopedSearch }" role="search" @submit.prevent="search">
      <Icon icon="mingcute:search-2-line" />
      <span v-if="isScopedSearch" class="workspace-search-scope">{{ searchScopeLabel }}</span>
      <input
        ref="searchInputRef"
        type="search"
        :placeholder="searchPlaceholder"
        :aria-label="isScopedSearch ? `搜索${scopeLabel}内容` : 'B站全站搜索'"
        @input="onSearchInput"
      />
    </form>
    <template v-if="!searchOnly">
      <span class="workspace-toolbar-divider" aria-hidden="true"></span>
      <div ref="filterWrapRef" class="workspace-filter-wrap">
        <button class="workspace-filter-button" :class="{ active: filterOpen || hasActiveFilter }" type="button" aria-label="打开筛选" title="筛选" :aria-expanded="filterOpen" @click="filterOpen = !filterOpen">
          <Icon icon="tabler:filter" />
        </button>
        <Transition name="filter-popover">
          <section v-if="filterOpen" class="workspace-filter-popover" role="dialog" :aria-label="`${scopeLabel}筛选`">
            <header><div><strong>{{ scopeLabel }}筛选</strong><small>只在{{ scopeLabel }}生效，并单独记忆</small></div><button type="button" aria-label="关闭筛选" @click="filterOpen = false"><Icon icon="mingcute:close-line" /></button></header>
            <label>
              <span>起始日期</span>
              <input class="workspace-filter-input" type="date" :value="publishAfterDate" aria-label="最早发布时间" @input="onDateInput" />
            </label>
            <label>
              <span>最短时长</span>
              <span class="workspace-duration-field"><input class="workspace-filter-input" type="number" min="0" step="0.5" inputmode="decimal" :value="minDurationMinutes" placeholder="不限" aria-label="最短视频时长（分钟）" @input="onDurationInput" /><em>分钟</em></span>
            </label>
            <div v-if="keywordFilterEnabled && scope === 'home'" class="workspace-keyword-filter">
              <div class="workspace-keyword-heading"><span>屏蔽关键词</span><small v-if="blockedKeywords?.length">{{ blockedKeywords.length }} 个</small></div>
              <p>标题包含任意关键词的视频将不再显示</p>
              <form class="workspace-keyword-entry" @submit.prevent="addKeyword">
                <input v-model="keywordDraft" class="workspace-filter-input" type="text" placeholder="例如：恶魔城" aria-label="屏蔽关键词" autocomplete="off" @keydown.enter="onKeywordEnter" />
                <button type="submit" :disabled="!keywordDraft.trim()">添加</button>
              </form>
              <ul v-if="blockedKeywords?.length" class="workspace-keyword-list" aria-label="已屏蔽的关键词">
                <li v-for="keyword in blockedKeywords" :key="keyword">
                  <span>{{ keyword }}</span>
                  <button type="button" :aria-label="`移除屏蔽关键词：${keyword}`" :title="`移除 ${keyword}`" @click="removeKeyword(keyword)"><Icon icon="mingcute:close-line" /></button>
                </li>
              </ul>
              <small class="workspace-keyword-hint" role="status">{{ keywordNotice || '输入后按回车添加，可添加多个关键词' }}</small>
            </div>
            <button class="workspace-filter-clear" type="button" :disabled="!hasActiveFilter" @click="clearFilters">清除筛选</button>
          </section>
        </Transition>
      </div>
      <button class="workspace-refresh-button" type="button" :disabled="refreshing" aria-label="刷新视频流" title="刷新视频流" @click="$emit('refresh')">
        <Icon icon="mingcute:refresh-2-line" :class="{ spinning: refreshing }" />
      </button>
    </template>
  </header>
</template>

<script setup lang="ts">
import { Icon } from "@iconify/vue"
import { computed, onMounted, onUnmounted, ref, watch } from "vue"
import { normalizeBlockedKeywords } from "../domain/title-keyword-filter"

const props = defineProps<{
  scope: "home" | "dynamics" | "favorites" | "history" | "watchlater"
  minDurationMinutes: string
  publishAfterDate: string
  refreshing?: boolean
  searchOnly?: boolean
  blockedKeywords?: string[]
  keywordFilterEnabled?: boolean
}>()
const emit = defineEmits<{
  (event: "update:minDurationMinutes", value: string): void
  (event: "update:publishAfterDate", value: string): void
  (event: "update:searchQuery", value: string): void
  (event: "update:blockedKeywords", value: string[]): void
  (event: "refresh"): void
}>()

const toolbarRef = ref<HTMLElement | null>(null)
const toolbarHidden = ref(false)
let scrollRoot: HTMLElement | null = null
let lastScrollTop = 0
let directionDistance = 0

function onFeedScroll(): void {
  const top = Math.max(0, scrollRoot ? scrollRoot.scrollTop : window.scrollY)
  const delta = top - lastScrollTop
  lastScrollTop = top
  // Keep active search and filter controls on screen; ignore nested popover scrolls.
  if (top <= 64 || filterOpen.value || toolbarRef.value?.contains(document.activeElement)) {
    toolbarHidden.value = false
    directionDistance = 0
    return
  }
  if (!delta) return
  if (Math.sign(delta) !== Math.sign(directionDistance)) directionDistance = 0
  directionDistance += delta
  if (Math.abs(directionDistance) >= 12) {
    toolbarHidden.value = directionDistance > 0
    directionDistance = 0
  }
}

const searchInputRef = ref<HTMLInputElement | null>(null)
const filterOpen = ref(false)
const keywordDraft = ref("")
const keywordNotice = ref("")
const filterWrapRef = ref<HTMLElement | null>(null)
const scopeLabels = { home: "首页", dynamics: "动态页", favorites: "收藏页", history: "历史页", watchlater: "稍后再看页" } as const
const searchScopeLabels = { dynamics: "动态内", favorites: "收藏内", history: "历史内", watchlater: "稍后再看内" } as const
const scopeLabel = computed(() => scopeLabels[props.scope])
const isScopedSearch = computed(() => props.scope !== "home")
const searchScopeLabel = computed(() => props.scope === "home" ? "" : searchScopeLabels[props.scope])
const searchPlaceholder = computed(() => props.scope === "home" ? "搜索 B 站全站内容" : `搜索${searchScopeLabel.value}的视频或 UP 主`)
const hasActiveFilter = computed(() => Boolean(props.minDurationMinutes || props.publishAfterDate || (props.keywordFilterEnabled && props.scope === "home" && props.blockedKeywords?.length)))

function addKeyword(): void {
  const keyword = keywordDraft.value.trim()
  if (!keyword) return
  const current = props.blockedKeywords ?? []
  const next = normalizeBlockedKeywords([...current, keyword])
  keywordNotice.value = next.length === current.length ? "该关键词已添加" : ""
  if (next.length !== current.length) emit("update:blockedKeywords", next)
  keywordDraft.value = ""
}
function onKeywordEnter(event: KeyboardEvent): void {
  event.preventDefault()
  if (!event.isComposing && event.keyCode !== 229) addKeyword()
}
function removeKeyword(keyword: string): void {
  emit("update:blockedKeywords", (props.blockedKeywords ?? []).filter((item) => item !== keyword))
  keywordNotice.value = ""
}

function search(): void {
  const value = searchInputRef.value?.value.trim() ?? ""
  if (isScopedSearch.value) {
    emit("update:searchQuery", value)
  } else if (value) {
    window.open("https://search.bilibili.com/all?keyword=" + encodeURIComponent(value), "_blank", "noopener,noreferrer")
  }
}
function onSearchInput(event: Event): void {
  if (!isScopedSearch.value || !(event.target instanceof HTMLInputElement)) return
  emit("update:searchQuery", event.target.value.trim())
}
function onDateInput(event: Event): void {
  if (event.target instanceof HTMLInputElement) emit("update:publishAfterDate", event.target.value)
}
function onDurationInput(event: Event): void {
  if (event.target instanceof HTMLInputElement) emit("update:minDurationMinutes", event.target.value)
}
function clearFilters(): void {
  emit("update:minDurationMinutes", "")
  emit("update:publishAfterDate", "")
  if (props.keywordFilterEnabled && props.scope === "home") emit("update:blockedKeywords", [])
  keywordDraft.value = ""
  keywordNotice.value = ""
}
function onDocumentPointerDown(event: PointerEvent): void {
  if (filterOpen.value && event.target instanceof Node && !filterWrapRef.value?.contains(event.target)) filterOpen.value = false
}
function onShortcut(event: KeyboardEvent): void {
  if (event.isComposing || !(event.metaKey || event.ctrlKey) || event.key.toLocaleLowerCase() !== "k") return
  event.preventDefault()
  toolbarHidden.value = false
  searchInputRef.value?.focus({ preventScroll: true })
}
onMounted(() => {
  scrollRoot = toolbarRef.value?.closest<HTMLElement>("#billnext-inbox-root") ?? null
  lastScrollTop = scrollRoot ? scrollRoot.scrollTop : window.scrollY
  ;(scrollRoot ?? window).addEventListener("scroll", onFeedScroll, { passive: true })
  window.addEventListener("keydown", onShortcut)
  document.addEventListener("pointerdown", onDocumentPointerDown)
})
onUnmounted(() => {
  ;(scrollRoot ?? window).removeEventListener("scroll", onFeedScroll)
  window.removeEventListener("keydown", onShortcut)
  document.removeEventListener("pointerdown", onDocumentPointerDown)
})
watch(() => props.scope, () => {
  toolbarHidden.value = false
  directionDistance = 0
  lastScrollTop = scrollRoot ? scrollRoot.scrollTop : window.scrollY
  keywordDraft.value = ""
  keywordNotice.value = ""
  if (searchInputRef.value) searchInputRef.value.value = ""
  emit("update:searchQuery", "")
})
</script>
