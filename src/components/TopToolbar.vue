<template>
  <Teleport to="#billnext-inbox-root">
    <Transition name="settings-window">
      <div v-if="toolsPanelOpen" class="settings-modal-mask" @click.self="close">
        <section class="settings-modal-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
          <aside class="settings-sidebar">
            <div class="settings-sidebar-heading">
              <span class="settings-modal-kicker">BillNext</span>
              <h2 id="settings-title">设置</h2>
              <p>阅读与动态偏好</p>
            </div>

            <nav class="settings-nav" aria-label="设置分类">
              <button
                v-for="section in settingsSections"
                :key="section.value"
                type="button"
                :class="{ active: activeSettingsSection === section.value }"
                :aria-current="activeSettingsSection === section.value ? 'page' : undefined"
                :aria-controls="`settings-panel-${section.value}`"
                @click="activeSettingsSection = section.value"
              >
                <Icon :icon="section.icon" />
                <span><strong>{{ section.label }}</strong><small>{{ section.caption }}</small></span>
              </button>
            </nav>

            <div class="settings-sidebar-status"><small>偏好自动保存在本机</small></div>
          </aside>

          <div class="settings-main">
            <header class="settings-modal-header">
              <div>
                <div class="settings-header-context">
                  <span class="settings-modal-kicker">PREFERENCES</span>
                  <span class="settings-scope-badge">{{ activeSettingsMeta.scope }}</span>
                </div>
                <h2>{{ activeSettingsMeta.label }}</h2>
                <p>{{ activeSettingsMeta.description }}</p>
              </div>
              <button class="settings-close-button" type="button" aria-label="关闭设置" @click="close"><Icon icon="mingcute:close-line" /></button>
            </header>

            <div class="settings-modal-body">
              <section id="settings-panel-global" v-show="activeSettingsSection === 'global'" class="settings-section" aria-label="跨页面设置">
                <button class="settings-toggle-row" type="button" @click="$emit('toggle-hide-want-watch')">
                  <span><strong>处理后隐藏“想看”卡片</strong><small>影响首页与动态列表，只保留尚未处理的视频</small></span>
                  <i :class="{ active: hideWantWatch }"><b></b></i>
                </button>
                <button class="settings-toggle-row" type="button" @click="$emit('toggle-open-video-on-want-watch')">
                  <span><strong>点击“想看”时后台打开视频</strong><small>新建标签但留在当前页面，方便连续挑选</small></span>
                  <i :class="{ active: openVideoOnWantWatch }"><b></b></i>
                </button>
                <button class="settings-toggle-row" type="button" @click="$emit('toggle-hover-autoplay')">
                  <span><strong>悬停时自动播放视频</strong><small>鼠标停在封面上后，静音加载低清晰度预览；移开立即停止</small></span>
                  <i :class="{ active: hoverAutoplay }"><b></b></i>
                </button>
                <button class="settings-toggle-row" type="button" @click="$emit('toggle-sidebar-collapsed')">
                  <span><strong>收起左侧导航</strong><small>开启后固定显示图标栏；关闭后固定显示完整导航</small></span>
                  <i :class="{ active: sidebarCollapsed }"><b></b></i>
                </button>
              </section>

            </div>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { Icon } from "@iconify/vue"
import { computed, ref } from "vue"

type SettingsSectionId = "global"

const settingsSections: Array<{
  value: SettingsSectionId
  label: string
  caption: string
  scope: string
  description: string
  icon: string
}> = [
  { value: "global", label: "跨页面", caption: "通用处理与界面行为", scope: "影响多个页面", description: "管理首页、动态及其他视频卡片共用的处理与界面行为。", icon: "mingcute:adjustment-line" },
]

defineProps<{
  hideWantWatch: boolean
  openVideoOnWantWatch: boolean
  hoverAutoplay: boolean
  sidebarCollapsed: boolean
}>()
defineEmits<{
  (event: "toggle-hide-want-watch"): void
  (event: "toggle-open-video-on-want-watch"): void
  (event: "toggle-hover-autoplay"): void
  (event: "toggle-sidebar-collapsed"): void
}>()
const toolsPanelOpen = ref(false)
const activeSettingsSection = ref<SettingsSectionId>("global")
const activeSettingsMeta = computed(() => settingsSections.find((section) => section.value === activeSettingsSection.value) ?? settingsSections[0])
function openToolsPanel(): void { toolsPanelOpen.value = true }
function close(): void { toolsPanelOpen.value = false }
defineExpose({ openToolsPanel })
</script>
