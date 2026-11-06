<script setup lang="ts">
const props = defineProps<{
  name: string;
  size?: number;
}>();

const PATHS: Record<string, string> = {
  plus: "M12 5v14M5 12h14",
  trash: "M4 7h16M9 7V5h6v2m-8 0 1 12h8l1-12",
  copy: "M9 9h10v10H9zM5 15V5h10",
  undo: "M9 10H4V5M4 10a8 8 0 1 1 2 6",
  redo: "M15 10h5V5m0 5a8 8 0 1 0-2 6",
  play: "M8 5v14l11-7z",
  download: "M12 4v10m0 0 4-4m-4 4-4-4M5 19h14",
  package: "M12 3 4 7.5v9L12 21l8-4.5v-9L12 3zM4 7.5 12 12l8-4.5M12 12v9",
  upload: "M12 14V4m0 0 4 4m-4-4-4 4M5 19h14",
  image: "M4 5h16v14H4zM8 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM4 16l5-5 4 4 2-2 5 5",
  text: "M6 6h12M12 6v12M9 18h6",
  shape: "M4 4h9v9H4zM14 14a3 3 0 1 0 6 0 3 3 0 0 0-6 0z",
  chart: "M4 19h16M7 16V9m5 7V5m5 11v-4",
  layers: "M12 4 3 9l9 5 9-5-9-5zM3 14l9 5 9-5",
  settings: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM4 12h2m12 0h2M12 4v2m0 12v2M6 6l1.5 1.5M16.5 16.5 18 18M18 6l-1.5 1.5M7.5 16.5 6 18",
  "zoom-in": "M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM14.5 14.5 20 20M10 7v6M7 10h6",
  "zoom-out": "M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM14.5 14.5 20 20M7 10h6",
  eye: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  "eye-off": "M4 4l16 16M10 6.3A9.7 9.7 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-2.2 2.8M6.2 8.2A17 17 0 0 0 2 12s3.5 6 10 6a9.6 9.6 0 0 0 3.2-.5",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M5 11h14v9H5z",
  unlock: "M7 11V8a5 5 0 0 1 9-3M5 11h14v9H5z",
  help: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.8.3-.9 1-.9 1.7M12 16.5h.01",
  close: "M6 6l12 12M18 6 6 18",
  check: "M5 12l5 5 9-11",
  "align-left": "M4 4v16M8 7h9M8 12h6M8 17h9",
  "align-center": "M12 4v16M7 7h10M8 12h8M7 17h10",
  "align-right": "M20 4v16M7 7h9M10 12h6M7 17h9",
  "align-top": "M4 4h16M7 8v9M12 8v6M17 8v9",
  "align-middle": "M4 12h16M7 7v10M12 8v8M17 7v10",
  "align-bottom": "M4 20h16M7 7v9M12 10v6M17 7v9",
  "distribute-h": "M4 4v16M20 4v16M10 6h4v12h-4z",
  "distribute-v": "M4 4h16M4 20h16M6 10h12v4H6z",
  group: "M4 4h6v6H4zM14 14h6v6h-6zM14 4h6v6h-6zM4 14h6v6H4z",
  menu: "M4 7h16M4 12h16M4 17h16",
  refresh: "M4 10a8 8 0 0 1 14-4l2 2m0-4v4h-4M20 14a8 8 0 0 1-14 4l-2-2m0 4v-4h4",
};

const d = PATHS[props.name] ?? PATHS.help;
</script>

<template>
  <svg
    class="cf-icon"
    :width="size ?? 16"
    :height="size ?? 16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="d" />
  </svg>
</template>

<style scoped>
.cf-icon {
  display: inline-block;
  vertical-align: -3px;
}
</style>