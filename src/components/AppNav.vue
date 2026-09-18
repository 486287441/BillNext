<template>
  <aside
    class="billnext-sidebar"
    :class="{ 'is-collapsed': collapsed }"
    aria-label="BillNext 主导航"
  >
    <button class="billnext-collapse-toggle" type="button" :aria-label="collapsed ? '展开导航' : '收起导航'" :title="collapsed ? '展开导航' : '收起导航'" @click.stop="toggleCollapsed">
      <Icon :icon="collapsed ? 'mingcute:right-line' : 'mingcute:left-line'" />
    </button>
    <a class="billnext-brand" href="https://www.bilibili.com/" title="BillNext 首页">
      <span class="billnext-brand-mark"><Icon icon="mingcute:bilibili-line" /></span>
      <span><strong>BillNext</strong></span>
    </a>

    <nav class="billnext-primary-nav" aria-label="内容导航">
      <a
        v-for="item in primaryItems"
        :key="item.label"
        :class="{ active: item.active }"
        :href="item.href"
        :title="item.label"
        :aria-current="item.active ? 'page' : undefined"
        @click="onPrimaryClick($event, item.tab)"
      >
        <Icon :icon="item.active ? item.activeIcon : item.icon" />
        <span>{{ item.label }}</span>
      </a>
    </nav>

    <nav class="billnext-secondary-nav" aria-label="个人内容">
      <a href="https://www.bilibili.com/?billnext=native" title="切换为原版 B 站">
        <Icon icon="mingcute:transfer-4-line" /><span>原版 B 站</span>
      </a>
      <a href="https://www.bilibili.com/?billnext=watchlater" title="稍后再看" :class="{ active: active === 'watchlater' }" @click.prevent="$emit('navigate-library', 'watchlater')">
        <Icon :icon="active === 'watchlater' ? 'mingcute:bookmark-fill' : 'mingcute:bookmark-line'" /><span>稍后再看</span>
      </a>
      <a href="https://www.bilibili.com/?billnext=favorites" title="收藏" :class="{ active: active === 'favorites' }" @click.prevent="$emit('navigate-library', 'favorites')">
        <Icon :icon="active === 'favorites' ? 'mingcute:star-fill' : 'mingcute:star-line'" /><span>收藏</span>
      </a>
      <a href="https://www.bilibili.com/?billnext=history" title="历史" :class="{ active: active === 'history' }" @click.prevent="$emit('navigate-library', 'history')">
        <Icon :icon="active === 'history' ? 'mingcute:time-fill' : 'mingcute:time-line'" /><span>历史</span>
      </a>
      <button type="button" title="设置" @click="$emit('open-tools')">
        <Icon icon="mingcute:settings-3-line" /><span>设置</span>
      </button>
    </nav>

    <a class="billnext-profile" :href="userMid ? 'https://space.bilibili.com/' + userMid : 'https://account.bilibili.com/'" title="个人空间">
      <span class="billnext-profile-avatar"><img v-if="userAvatar" :src="userAvatar" alt="用户头像" /><Icon v-else icon="mingcute:user-3-line" /></span>
      <span>
        <strong>{{ userName || '我的空间' }}</strong>
        <small v-if="userLoaded" class="billnext-profile-status">
          <i>LV{{ userLevel }}</i>
          <em :class="{ active: userVipActive }">{{ userVipActive ? userVipLabel : "未开通大会员" }}</em>
        </small>
      </span>
      <Icon icon="mingcute:right-small-line" />
    </a>
  </aside>
</template>

<script setup lang="ts">
import { Icon } from "@iconify/vue"
import { computed, onMounted, ref } from "vue"
import { fetchLoggedInUser } from "../services/bilibili-api"
import type { LibraryKind } from "../domain/types"
import type { HomeTabValue } from "./HomeTabsBar.vue"

type NavActive = "home" | "moments" | "live" | "tracking" | "checklist" | "favorites" | "history" | "watchlater"
const props = withDefaults(defineProps<{ active: NavActive; trashCount: number; collapsed?: boolean; localNavigation?: boolean }>(), {
  collapsed: false,
})
const emit = defineEmits<{
  (event: "open-trash"): void
  (event: "open-tools"): void
  (event: "navigate-library", kind: LibraryKind): void
  (event: "navigate-tab", tab: HomeTabValue): void
  (event: "update:collapsed", collapsed: boolean): void
}>()

const userAvatar = ref("")
const userMid = ref("")
const userName = ref("")
const userLevel = ref(0)
const userVipActive = ref(false)
const userVipLabel = ref("大会员")
const userLoaded = ref(false)
const collapsed = computed(() => props.collapsed)

function toggleCollapsed(): void {
  emit("update:collapsed", !collapsed.value)
}
const primaryItems = computed(() => [
  { label: "首页", icon: "mingcute:home-5-line", activeIcon: "mingcute:home-5-fill", href: "https://www.bilibili.com/", active: props.active === "home", tab: "recommended" as HomeTabValue },
  { label: "动态", icon: "tabler:windmill", activeIcon: "tabler:windmill-filled", href: "https://www.bilibili.com/?billnext=following", active: props.active === "moments", tab: "following" as HomeTabValue },
  { label: "直播", icon: "mingcute:live-line", activeIcon: "mingcute:live-fill", href: "https://www.bilibili.com/?billnext=live", active: props.active === "live", tab: "live" as HomeTabValue },
  { label: "追番", icon: "mingcute:tv-2-line", activeIcon: "mingcute:tv-2-fill", href: "https://www.bilibili.com/?billnext=tracking", active: props.active === "tracking", tab: "tracking" as HomeTabValue },
  { label: "清单", icon: "mingcute:list-check-3-line", activeIcon: "mingcute:list-check-3-fill", href: "https://www.bilibili.com/?billnext=checklist", active: props.active === "checklist", tab: "checklist" as HomeTabValue },
])

function onPrimaryClick(event: MouseEvent, tab: HomeTabValue): void {
  if (!props.localNavigation && window.location.hostname !== "www.bilibili.com") return
  event.preventDefault()
  emit("navigate-tab", tab)
}

onMounted(() => {
  void fetchLoggedInUser().then((user) => {
    userAvatar.value = user.face
    userMid.value = user.mid
    userName.value = user.name
    userLevel.value = user.level
    userVipActive.value = user.vipActive
    userVipLabel.value = user.vipLabel
    userLoaded.value = true
  }).catch(() => undefined)
})

</script>
