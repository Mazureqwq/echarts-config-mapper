<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useDocumentStore } from "@/stores/documentStore";
import { LiveExecutor } from "@/core/live/liveExecutor";
import ItemView from "@/workbench/ItemView.vue";

const props = defineProps<{ id: string }>();
const router = useRouter();
const ws = useWorkspaceStore();
const doc = useDocumentStore();

const scale = ref(1);
const showF11 = ref(false);
const cursorHidden = ref(false);
let executor: LiveExecutor | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

const screen = computed(() => doc.currentScreen);

function fit(): void {
  const canvas = screen.value?.canvas;
  if (!canvas) return;
  scale.value = Math.min(window.innerWidth / canvas.width, window.innerHeight / canvas.height);
}

function exitPlay(): void {
  router.push(`/workbench/${props.id}`);
}

function onKey(ev: KeyboardEvent): void {
  if (ev.key === "Escape") {
    exitPlay();
  }
}

function onMouseMove(): void {
  cursorHidden.value = false;
  if (idleTimer !== null) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    cursorHidden.value = true;
  }, 3000);
}

onMounted(() => {
  ws.load();
  const target =
    ws.workspace.screens.find((s) => s.id === props.id) ?? ws.workspace.screens[0] ?? null;
  if (!target) {
    router.replace("/");
    return;
  }
  doc.currentScreenId = target.id;
  fit();
  window.addEventListener("resize", fit);
  window.addEventListener("keydown", onKey);
  window.addEventListener("mousemove", onMouseMove);
  onMouseMove();

  // 实时数据保持工作
  executor = new LiveExecutor();
  for (const item of doc.items) {
    if (item.kind === "chart" && item.spec.source) {
      executor.register(
        item.id,
        item.spec.source,
        (u) => {
          void doc.applyLiveUpdate(u.id, u.data, {
            stale: u.stale,
            error: u.error,
            updatedAt: u.updatedAt,
          });
        }
      );
    }
  }
  void executor.tick();

  try {
    if (!localStorage.getItem("chartforge.play.f11hint")) {
      showF11.value = true;
      localStorage.setItem("chartforge.play.f11hint", "1");
      setTimeout(() => (showF11.value = false), 5000);
    }
  } catch {
    /* 忽略 */
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", fit);
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("mousemove", onMouseMove);
  if (idleTimer !== null) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  executor?.dispose();
  executor = null;
});
</script>

<template>
  <div class="play-view">
    <div v-if="screen" class="play-view__stage" :style="{ transform: `scale(${scale})` }">
      <div
        class="play-view__canvas"
        :style="{
          width: `${screen.canvas.width}px`,
          height: `${screen.canvas.height}px`,
          background:
            screen.canvas.background.kind === 'color'
              ? screen.canvas.background.color
              : screen.canvas.background.kind === 'gradient'
                ? `linear-gradient(${screen.canvas.background.angle}deg, ${screen.canvas.background.from}, ${screen.canvas.background.to})`
                : `url(${screen.canvas.background.src}) center/cover no-repeat`,
        }"
      >
        <ItemView v-for="item in screen.items" :key="item.id" :item="item" />
      </div>
    </div>
    <button
      class="play-view__exit"
      :class="{ 'play-view__exit--hidden': cursorHidden }"
      @click="exitPlay"
    >
      退出演示 (Esc)
    </button>
    <div v-if="showF11" class="play-view__hint">按 F11 可全屏演示，Esc 退出演示模式</div>
  </div>
</template>

<style scoped>
.play-view {
  height: 100%;
  background: #000;
  overflow: hidden;
  position: relative;
}
.play-view__stage {
  position: absolute;
  left: 50%;
  top: 50%;
  transform-origin: center center;
  translate: -50% -50%;
}
.play-view__canvas {
  position: relative;
}
.play-view__hint {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  padding: 8px 18px;
  border-radius: 999px;
  font-size: 13px;
}
.play-view__exit {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 10;
  padding: 7px 14px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  transition: opacity 0.3s;
}
.play-view__exit:hover {
  background: rgba(255, 255, 255, 0.25);
}
.play-view__exit--hidden {
  opacity: 0;
  pointer-events: none;
}
</style>
