<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useDocumentStore } from "@/stores/documentStore";
import { LiveExecutor } from "@/core/live/liveExecutor";
import {
  Playlist,
  clampInterval,
  parseIdList,
  DEFAULT_INTERVAL_SEC,
} from "@/core/play/playlist";
import { isPlaceholder } from "@/core/model/templates";
import ItemView from "@/workbench/ItemView.vue";

const props = defineProps<{ id: string }>();
const router = useRouter();
const route = useRoute();
const ws = useWorkspaceStore();
const doc = useDocumentStore();

const scale = ref(1);
const showF11 = ref(false);
const cursorHidden = ref(false);
let executor: LiveExecutor | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

// ---- 轮播状态 ----
let playlist: Playlist | null = null;
const playlistIds = ref<string[]>([]);
const curIndex = ref(0);
const paused = ref(false);
const intervalSec = ref(DEFAULT_INTERVAL_SEC);

const multi = computed(() => playlistIds.value.length > 1);

const screen = computed(() => doc.currentScreen);

/** 演示时不显示模板占位框（它们只是编辑期的辅助线） */
const visibleItems = computed(() => (screen.value?.items ?? []).filter((i) => !isPlaceholder(i)));

/** 切屏：换屏 + 重建实时数据 + 重新适配缩放 */
function switchTo(id: string, index: number): void {
  doc.currentScreenId = id;
  curIndex.value = index;
  setupLive();
  fit();
}

/** 当前屏里带实时数据源的图表重新挂到执行器上 */
function setupLive(): void {
  executor?.dispose();
  executor = null;
  if (!doc.items.some((i) => i.kind === "chart" && i.spec.source)) return;
  executor = new LiveExecutor({ resolveApi: () => ws.settings.api });
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
}

function gotoNext(): void {
  playlist?.next();
}

function gotoPrev(): void {
  playlist?.prev();
}

function togglePause(): void {
  if (!playlist || !multi.value) return;
  paused.value = playlist.toggle();
}

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
    return;
  }
  if (!multi.value) return;
  if (ev.key === "ArrowRight" || ev.key === "PageDown") {
    ev.preventDefault();
    gotoNext();
  } else if (ev.key === "ArrowLeft" || ev.key === "PageUp") {
    ev.preventDefault();
    gotoPrev();
  } else if (ev.key === " " || ev.code === "Space") {
    ev.preventDefault();
    togglePause();
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
  const start =
    ws.workspace.screens.find((s) => s.id === props.id) ?? ws.workspace.screens[0] ?? null;
  if (!start) {
    router.replace("/screens");
    return;
  }

  // 轮播列表来自 ?list=a,b,c&interval=15；缺省就只播当前这一屏
  const requested = parseIdList(route.query.list as string | string[] | undefined);
  const known = ws.workspace.screens.map((s) => s.id);
  const picked = requested.filter((id) => known.includes(id));
  const frames = (picked.length ? picked : [start.id]).map((id) => ({ id }));
  playlistIds.value = frames.map((f) => f.id);
  intervalSec.value = clampInterval(
    Number(route.query.interval) || DEFAULT_INTERVAL_SEC
  );

  doc.currentScreenId = frames[0].id;
  curIndex.value = 0;
  fit();
  window.addEventListener("resize", fit);
  window.addEventListener("keydown", onKey);
  window.addEventListener("mousemove", onMouseMove);
  onMouseMove();

  // 实时数据保持工作（切屏时会重建）
  setupLive();

  if (frames.length > 1) {
    playlist = new Playlist({
      screens: frames,
      intervalSec: intervalSec.value,
      onChange: switchTo,
    });
    playlist.start();
  }

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
  playlist?.dispose();
  playlist = null;
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
        <ItemView v-for="item in visibleItems" :key="item.id" :item="item" />
      </div>
    </div>
    <div class="play-view__controls" :class="{ 'play-view__controls--hidden': cursorHidden }">
      <template v-if="multi">
        <button class="play-view__ctrl" title="上一屏（←）" @click="gotoPrev">‹</button>
        <span class="play-view__count">{{ curIndex + 1 }} / {{ playlistIds.length }}</span>
        <button class="play-view__ctrl play-view__ctrl--wide" @click="togglePause">
          {{ paused ? "继续（空格）" : "暂停（空格）" }}
        </button>
        <button class="play-view__ctrl" title="下一屏（→）" @click="gotoNext">›</button>
        <span class="play-view__interval">{{ paused ? "已暂停" : `每 ${intervalSec} 秒切换` }}</span>
      </template>
      <button class="play-view__exit" @click="exitPlay">退出演示 (Esc)</button>
    </div>

    <div v-if="multi" class="play-view__dots">
      <span
        v-for="(id, i) in playlistIds"
        :key="id"
        class="play-view__dot"
        :class="{ 'play-view__dot--active': i === curIndex }"
      />
    </div>

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
.play-view__controls {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: opacity 0.3s;
}
.play-view__controls--hidden {
  opacity: 0;
  pointer-events: none;
}
.play-view__ctrl {
  min-width: 32px;
  padding: 6px 10px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}
.play-view__ctrl:hover {
  background: rgba(255, 255, 255, 0.25);
}
.play-view__ctrl--wide {
  font-size: 12px;
}
.play-view__count {
  color: #fff;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  opacity: 0.9;
}
.play-view__interval {
  color: #fff;
  font-size: 12px;
  opacity: 0.65;
}
.play-view__dots {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  z-index: 10;
}
.play-view__dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.32);
}
.play-view__dot--active {
  background: #fff;
  width: 20px;
  transition: width 0.25s;
}
.play-view__exit {
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
</style>
