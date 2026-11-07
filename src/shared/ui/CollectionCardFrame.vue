<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    title: string;
    thumbnail?: string | null;
    draggable?: boolean;
  }>(),
  { thumbnail: null, draggable: false }
);

const emit = defineEmits<{
  (e: "open"): void;
  (e: "dragstart", event: DragEvent): void;
}>();

function onDragStart(event: DragEvent): void {
  if (props.draggable) emit("dragstart", event);
}
</script>

<template>
  <article
    class="collection-card"
    :class="{ 'collection-card--draggable': props.draggable }"
    :draggable="props.draggable"
    @dragstart="onDragStart"
  >
    <div v-if="$slots.selection" class="collection-card__selection" @click.stop @mousedown.stop @dragstart.stop>
      <slot name="selection" />
    </div>

    <div
      class="collection-card__thumbnail"
      role="button"
      tabindex="0"
      :aria-label="`打开${props.title}`"
      @click="emit('open')"
      @keydown.enter.prevent="emit('open')"
      @keydown.space.prevent="emit('open')"
    >
      <img v-if="props.thumbnail" :src="props.thumbnail" alt="" draggable="false" />
      <div v-else class="collection-card__thumbnail-placeholder">
        <slot name="thumbnail-placeholder" />
      </div>
    </div>

    <div class="collection-card__title" :title="props.title" @click="emit('open')">
      {{ props.title }}
    </div>
    <div v-if="$slots.metadata" class="collection-card__metadata">
      <slot name="metadata" />
    </div>
    <div v-if="$slots.actions" class="collection-card__actions">
      <slot name="actions" />
    </div>
    <div v-if="$slots.footer" class="collection-card__footer">
      <slot name="footer" />
    </div>
  </article>
</template>

<style scoped>
.collection-card {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--cf-border);
  border-radius: 10px;
  background: var(--cf-panel);
}

.collection-card--draggable {
  cursor: grab;
}

.collection-card--draggable:active {
  cursor: grabbing;
}

.collection-card__selection {
  position: absolute;
  z-index: 2;
  top: 8px;
  left: 8px;
}

.collection-card__selection :deep(.collection-card__checkbox) {
  display: flex;
  width: 22px;
  height: 22px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--cf-border);
  border-radius: 6px;
  background: color-mix(in srgb, var(--cf-panel) 88%, transparent);
  cursor: pointer;
}

.collection-card__selection :deep(input) {
  margin: 0;
  cursor: pointer;
}

.collection-card__thumbnail {
  position: relative;
  display: block;
  width: 100%;
  overflow: hidden;
  aspect-ratio: 16 / 9;
  background: var(--cf-canvas-bg);
  cursor: pointer;
  outline-offset: -3px;
}

.collection-card__thumbnail img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.collection-card__thumbnail-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--cf-text-2);
  font-size: 12px;
}

.collection-card__title {
  overflow: hidden;
  padding: 10px 12px 4px;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.collection-card__metadata {
  display: flex;
  min-height: 8px;
  flex-wrap: wrap;
  gap: 4px;
  padding: 0 12px;
}

.collection-card__metadata :deep(.collection-card__chip) {
  padding: 1px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--cf-primary) 10%, transparent);
  color: var(--cf-primary);
  font-size: 11px;
}

.collection-card__metadata :deep(.collection-card__chip--tag) {
  border: 1px solid var(--cf-border);
  background: var(--cf-bg);
  color: var(--cf-text-2);
}

.collection-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 6px 8px 6px;
}

.collection-card__footer {
  padding: 0 12px 10px;
}
</style>
