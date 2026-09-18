<template>
  <div ref="surface" class="motion-view"><slot /></div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue"
import gsap from "gsap"
import { motionEnabled } from "../utils/motion"
const props = defineProps<{ identity: string }>()
const surface = ref<HTMLElement | null>(null)
let tween: gsap.core.Tween | undefined
function reveal(): void {
  tween?.kill()
  const el = surface.value
  if (!el) return
  if (!motionEnabled()) {
    gsap.set(el, { clearProps: "opacity,transform" })
    return
  }
  // Keep mounting, requests and focus immediate during rapid navigation.
  tween = gsap.fromTo(el, { opacity: 0, y: 8 }, {
    opacity: 1, y: 0, duration: 0.32, ease: "power3.out",
    clearProps: "opacity,transform", overwrite: true,
  })
}
onMounted(reveal)
watch(() => props.identity, reveal, { flush: "post" })
onBeforeUnmount(() => tween?.kill())
</script>
