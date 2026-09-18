<template>
  <TransitionGroup ref="group" :name="name" :tag="tag" class="motion-list" appear
    @enter="prepareEnter" @after-enter="cleanEnter" @enter-cancelled="cleanEnter"
    @before-leave="prepareLeave" @after-leave="cleanLeave" @leave-cancelled="cleanLeave">
    <slot />
  </TransitionGroup>
</template>

<script setup lang="ts">
import { onBeforeUpdate, ref } from "vue"
withDefaults(defineProps<{ name?: string; tag?: string }>(), { name: "home-card", tag: "div" })
const group = ref<{ $el: HTMLElement } | null>(null)
onBeforeUpdate(() => {
  const children = group.value?.$el?.children
  if (!children) return
  for (const node of children) {
    const rect = node.getBoundingClientRect()
    node.classList.toggle("motion-offscreen", rect.bottom < -40 || rect.top > window.innerHeight + 40)
  }
})
function prepareEnter(node: Element): void {
  const rect = node.getBoundingClientRect()
  const offscreen = rect.bottom < 0 || rect.top > window.innerHeight
  node.classList.toggle("motion-offscreen", offscreen)
  if (offscreen) return
  const siblings = Array.from(node.parentElement?.children ?? [])
  let visibleBefore = 0
  for (const item of siblings) {
    if (item === node || visibleBefore === 4) break
    const bounds = item.getBoundingClientRect()
    if (bounds.bottom >= 0 && bounds.top <= window.innerHeight) visibleBefore += 1
  }
  ;(node as HTMLElement).style.setProperty("--motion-delay", `${visibleBefore * 24}ms`)
}
function cleanEnter(node: Element): void {
  node.classList.remove("motion-offscreen")
  ;(node as HTMLElement).style.removeProperty("--motion-delay")
}
function prepareLeave(node: Element): void {
  const el = node as HTMLElement
  const rect = el.getBoundingClientRect()
  el.classList.toggle("motion-offscreen", rect.bottom < 0 || rect.top > window.innerHeight)
  // Preserve the grid cell while Vue moves siblings into its gap.
  el.style.width = `${el.offsetWidth}px`
  el.style.height = `${el.offsetHeight}px`
  el.style.left = `${el.offsetLeft}px`
  el.style.top = `${el.offsetTop}px`
}
function cleanLeave(node: Element): void {
  const el = node as HTMLElement
  for (const property of ["width", "height", "left", "top"]) el.style.removeProperty(property)
  el.classList.remove("motion-offscreen")
}
</script>
