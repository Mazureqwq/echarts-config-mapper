<script setup lang="ts">
import Icon from "@/shared/ui/Icon.vue";

defineProps<{
  title: string;
}>();
</script>

<template>
  <section class="empty-state">
    <Icon name="chart" :size="42" />
    <p class="empty-state__title">{{ title }}</p>
    <div v-if="$slots.default" class="empty-state__content">
      <slot />
    </div>
    <div v-if="$slots.actions" class="empty-state__actions">
      <slot name="actions" />
    </div>
  </section>
</template>

<style scoped>
.empty-state {
  padding: 80px 0;
  color: var(--cf-text-2);
  text-align: center;
}

.empty-state__title {
  margin: 12px 0 16px;
  color: var(--cf-text);
  font-size: 14px;
}

.empty-state :deep(.empty-state__steps) {
  display: grid;
  gap: 10px;
  max-width: 520px;
  margin: 0 auto 20px;
  padding: 0;
  list-style: none;
  text-align: left;
}

.empty-state :deep(.empty-state__steps li) {
  padding: 10px 14px;
  border: 1px solid var(--cf-border);
  border-radius: 8px;
  background: var(--cf-panel);
  font-size: 12px;
  line-height: 1.6;
}

.empty-state :deep(.empty-state__steps strong) {
  display: block;
  margin-bottom: 2px;
  color: var(--cf-text);
  font-size: 13px;
}

.empty-state__actions {
  display: flex;
  justify-content: center;
  gap: 8px;
}
</style>