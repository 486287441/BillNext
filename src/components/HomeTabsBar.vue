<template>
  <header class="home-feed-header">
    <div class="home-feed-tabs" role="tablist" aria-label="首页视频流">
      <button v-for="tab in tabs" :key="tab.value" class="home-feed-tab" :class="{ 'is-active': active === tab.value }" type="button" role="tab" :aria-selected="active === tab.value" @click="select(tab.value)">
        {{ tab.label }}
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
export type HomeTabValue = "recommended" | "following" | "live" | "tracking" | "checklist" | "popular" | "ranking"
const props = defineProps<{ active: HomeTabValue }>()
const emit = defineEmits<{ (event: "select", tab: HomeTabValue): void }>()
const tabs: Array<{ value: HomeTabValue; label: string }> = [
  { value: "recommended", label: "个性推荐" },
  { value: "following", label: "正在关注" },
  { value: "live", label: "关注直播" },
  { value: "tracking", label: "正在追番" },
  { value: "checklist", label: "经典清单" },
  { value: "popular", label: "热门视频" },
  { value: "ranking", label: "排行" },
]
function select(tab: HomeTabValue): void {
  if (tab === props.active) return
  emit("select", tab)
}
</script>
