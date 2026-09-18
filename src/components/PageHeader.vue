<template>
  <header class="page-header">
    <div class="page-header-copy">
      <span class="page-header-eyebrow"><i v-if="variant === 'live'" aria-hidden="true"></i>{{ variant === 'live' ? 'FOLLOWING LIVE' : 'MY LIBRARY' }}</span>
      <h1 :id="titleId">{{ title }}</h1>
      <p class="page-header-subtitle" :aria-live="variant === 'live' ? 'polite' : undefined">{{ subtitle }}</p>
      <div v-if="$slots.meta" class="page-header-meta"><slot name="meta" /></div>
    </div>
    <div v-if="$slots.actions" class="page-header-actions"><slot name="actions" /></div>
  </header>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  subtitle: string
  titleId?: string
  variant?: 'library' | 'live'
}>(), { variant: 'library' })
</script>
