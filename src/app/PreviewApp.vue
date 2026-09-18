<template>
  <main class="inbox-shell home-shell" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
    <AppNav local-navigation :active="previewTab === 'checklist' ? 'checklist' : previewTab === 'recommended' ? 'home' : 'moments'" :trash-count="0" :collapsed="sidebarCollapsed" @update:collapsed="updateSidebar" @navigate-tab="previewTab = $event" @navigate-library="() => undefined" @open-tools="showPreviewToast('筛选设置已打开')" />
    <WorkspaceToolbar v-if="previewTab !== 'checklist'" :scope="previewTab === 'recommended' ? 'home' : 'dynamics'" min-duration-minutes="" publish-after-date="" :keyword-filter-enabled="previewTab === 'recommended'" :blocked-keywords="homeBlockedKeywords" @update:blocked-keywords="setBlockedKeywords" />

    <MotionView :identity="previewTab">
    <ChecklistView v-if="previewTab === 'checklist'" :watched-ids="watchedChecklistIds" :availability-map="{}" @update:watched-ids="watchedChecklistIds = $event" />

    <section v-else class="inbox-content" :class="{ 'home-showcase-preview': previewTab === 'recommended', 'dynamic-inbox-content': previewTab !== 'recommended' }">
      <article v-if="previewTab !== 'recommended'" class="group-block">
        <h2><span>今天</span><small>{{ visibleCards.length }}</small></h2>
        <MotionList class="group-list">
          <VideoCard
            v-for="card in visibleCards"
            :key="card.dynamicId"
            :card="card"
            :pending-map="{}"
            :want-watch-map="wantWatchMap"
            :open-video-on-want-watch="false"
            :following-up-map="followingMap"
            relation-pending-mid=""
            :home-highlights="previewTab === 'recommended'"
            @want-watch="markWant(card)"
            @help-read="startReading(card)"
            @dislike="hideCard(card)"
            @toggle-follow="() => undefined"
          />
        </MotionList>
      </article>
      <section v-else class="home-showcase">
        <div class="home-showcase-lead">
        <MotionList class="home-featured-frame">
        <VideoCard
            v-for="card in visibleCards.slice(0, 1)"
            :key="card.dynamicId"
            :card="card"
            :pending-map="{}"
            :want-watch-map="wantWatchMap"
            :open-video-on-want-watch="false"
            :following-up-map="followingMap"
            relation-pending-mid=""
            layout-variant="featured"
            home-highlights
            home-layout
            @want-watch="markWant(card)"
            @help-read="startReading(card)"
            @dislike="hideCard(card)"
          />
        </MotionList>
        <div class="home-showcase-side-frame">
        <MotionList class="home-showcase-secondary" tag="div" name="home-card">
          <VideoCard
            v-for="card in visibleCards.slice(1, 4)"
            :key="card.dynamicId"
            :card="card"
            :pending-map="{}"
            :want-watch-map="wantWatchMap"
            :open-video-on-want-watch="false"
            :following-up-map="followingMap"
            relation-pending-mid=""
            layout-variant="compact"
            home-highlights
            home-layout
            @want-watch="markWant(card)"
            @help-read="startReading(card)"
            @dislike="hideCard(card)"
          />
        </MotionList>
        </div>
      </div>
        <div class="home-showcase-section-head"><h2>更多推荐</h2></div>
        <MotionList class="home-showcase-more">
          <VideoCard
            v-for="card in visibleCards.slice(4)"
            :key="card.dynamicId"
            :card="card"
            :pending-map="{}"
            :want-watch-map="wantWatchMap"
            :open-video-on-want-watch="false"
            :following-up-map="followingMap"
            relation-pending-mid=""
            home-highlights
            home-layout
            @want-watch="markWant(card)"
            @help-read="startReading(card)"
            @dislike="hideCard(card)"
          />
        </MotionList>
      </section>
    </section>

    </MotionView>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from "vue"
import MotionView from "../components/MotionView.vue"
import MotionList from "../components/MotionList.vue"
import AppNav from "../components/AppNav.vue"
import ChecklistView from "../components/ChecklistView.vue"
import VideoCard from "../components/VideoCard.vue"
import WorkspaceToolbar from "../components/WorkspaceToolbar.vue"
import type { VideoDynamicCard } from "../domain/types"
import { showToast } from "../services/toast"
import { isTitleBlocked, normalizeBlockedKeywords } from "../domain/title-keyword-filter"
import { readPersistedState, writePersistedState } from "../services/storage"

const imageUrls = [
  "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=640&h=360&q=84",
  "https://images.unsplash.com/photo-1531297484001-80022131f5a1?auto=format&fit=crop&w=640&h=360&q=84",
  "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=640&h=360&q=84",
  "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=640&h=360&q=84",
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=640&h=360&q=84",
  "https://images.unsplash.com/photo-1504639725590-34d0984388bd?auto=format&fit=crop&w=640&h=360&q=84",
  "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=640&h=360&q=84",
  "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=640&h=360&q=84",
  "https://images.unsplash.com/photo-1484417894907-623942c8ee29?auto=format&fit=crop&w=640&h=360&q=84",
  "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=640&h=360&q=84",
  "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=640&h=360&q=84",
  "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=640&h=360&q=84",
  "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=640&h=360&q=84",
  "https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=640&h=360&q=84",
  "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=640&h=360&q=84",
]
const titles = [
  "总决赛遇到外挂狙击，演都不演专杀选手",
  "为什么在 AI 上付费是极其值得的投资",
  "从底层理解模型能力：一次讲清上下文",
  "马斯克的大学室友，想用空气造石油",
  "知名律师讲杀人犯七年多潜逃出狱",
  "怀旧服这波 DNA 动了，老玩家到底香不香",
  "从佩服到文化，创伤受害者并不能成为理由",
  "总决赛 1v13 成功吃鸡，最后压力拉满",
  "导演把真相藏在片尾曲后？万字拆解",
  "空调移机这几天就不制冷了，原因很简单",
  "冷知识：系统设置里最容易忽略的五个功能",
  "做产品六年后，我重新理解了信息密度",
  "桌面效率工作流：把碎片时间重新收回来",
  "这一期把视觉层级和留白讲透",
  "一小时学会现代前端的关键布局思路",
]
const cards = ref<VideoDynamicCard[]>(titles.map((title, index) => ({
  dynamicId: String(index + 1),
  videoAid: String(1000 + index),
  videoBvid: "BV1xx411c7m" + index,
  title,
  cover: imageUrls[index],
  durationText: ["03:44", "19:04", "23:40", "06:20", "33:29"][index % 5],
  durationSeconds: 224 + index * 83,
  playCount: 13000 + index * 12700,
  likeCount: 2000 + index * 5000,
  danmakuCount: 7 + index * 31,
  upMid: String(9000 + index),
  upName: ["艺术家阿克曼", "小Lin说", "哔哩哔哩番剧", "通俗解馋", "迷案追踪"][index % 5],
  upAvatar: `https://i.pravatar.cc/96?img=${(index % 45) + 1}`,
  publishAt: 1785715200 - index * 1800,
  tag: ["娱乐", "知识", "娱乐", "知识", "知识"][index % 5],
})))

const previewScreen = new URL(window.location.href).searchParams.get("screen")
const previewTab = ref(previewScreen === "checklist" ? "checklist" : previewScreen === "home" ? "recommended" : "following")
const watchedChecklistIds = ref<string[]>(["imdb:tt0111161", "imdb:tt0068646"])
const sidebarCollapsed = ref(true)
const wantWatchMap = ref<Record<string, boolean>>({})
const followingMap = Object.fromEntries(cards.value.map((card, index) => [card.upMid, index % 3 === 0]))
const homeBlockedKeywords = ref(readPersistedState().homeBlockedKeywords)
const visibleCards = computed(() => previewTab.value === "recommended"
  ? cards.value.filter((card) => !isTitleBlocked(card.title, homeBlockedKeywords.value))
  : cards.value)
function setBlockedKeywords(value: string[]): void {
  homeBlockedKeywords.value = normalizeBlockedKeywords(value)
  writePersistedState({ homeBlockedKeywords: homeBlockedKeywords.value })
}
function updateSidebar(value: boolean): void { sidebarCollapsed.value = value }
function showPreviewToast(message: string): void { showToast(message) }
function markWant(card: VideoDynamicCard): void {
  wantWatchMap.value = { ...wantWatchMap.value, [card.dynamicId]: true }
  showToast("已标记为“想看”")
}
function startReading(): void {
  showToast("已开始生成帮读摘要")
}
function hideCard(card: VideoDynamicCard): void {
  cards.value = cards.value.filter((item) => item.dynamicId !== card.dynamicId)
  showToast("已移入不想看")
}
</script>
