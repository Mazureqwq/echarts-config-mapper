<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    :stroke="color"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="glyph"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{ name: string; size?: number; color?: string }>(),
  { size: 16, color: "currentColor" },
);

const GLYPHS: Record<string, string> = {
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h9a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9h-9a6 6 0 0 0 0 12h3"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
  image:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m4 17 4.5-4.5 3 3L15 11l5 5"/>',
  code: '<path d="m9 8-4 4 4 4"/><path d="m15 8 4 4-4 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  fit: '<path d="M4 9V5a1 1 0 0 1 1-1h4"/><path d="M20 15v4a1 1 0 0 1-1 1h-4"/><path d="M15 4h4a1 1 0 0 1 1 1v4"/><path d="M9 20H5a1 1 0 0 1-1-1v-4"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  table:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10M15 10v10"/>',
  layers: '<path d="m12 3 8 4.5-8 4.5-8-4.5z"/><path d="m4 12.5 8 4.5 8-4.5"/><path d="m4 17 8 4.5 8-4.5"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
  line: '<path d="M3 17l5-6 4 3 5-8 4 4"/><circle cx="8" cy="11" r="1.2"/><circle cx="12" cy="14" r="1.2"/><circle cx="17" cy="6" r="1.2"/>',
  bar: '<path d="M5 20V11M11 20V5M17 20v-6"/>',
  pie: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/>',
  map: '<path d="M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
  scatter: '<circle cx="7" cy="16" r="1.6"/><circle cx="12" cy="9" r="1.6"/><circle cx="17" cy="14" r="1.6"/><circle cx="10" cy="18" r="1.6"/><circle cx="18" cy="7" r="1.6"/>',
  radar:
    '<path d="m12 3 8 6-3 9H7l-3-9z"/><path d="m12 7 4.5 3.4-1.7 5.1H9.2L7.5 10.4z"/>',
  drag: '<circle cx="9" cy="7" r="1.1"/><circle cx="15" cy="7" r="1.1"/><circle cx="9" cy="12" r="1.1"/><circle cx="15" cy="12" r="1.1"/><circle cx="9" cy="17" r="1.1"/><circle cx="15" cy="17" r="1.1"/>',
  reset: '<path d="M4 4v6h6"/><path d="M4.5 13a7.5 7.5 0 1 0 2-6.4"/>',
  check: '<path d="m5 13 4 4L19 7"/>',
  warning: '<path d="M12 4 3 20h18z"/><path d="M12 10v4M12 17h.01"/>',
};

const glyph = computed(() => GLYPHS[props.name] ?? GLYPHS.spark);
</script>
