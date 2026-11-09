<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { useDocumentStore } from "@/stores/documentStore";
import { componentRegistry } from "@/core/components/builtins";
import { createLayoutAssetItems } from "@/core/design/layoutBackgrounds";
import { GRID_SIZE_OPTIONS, useUiStore } from "@/stores/uiStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { createItem } from "@/core/model/schema";
import { boxSelect } from "@/core/geometry/hit";
import { arrowNudgeStep, buildEqualSpacingCandidates, findNearestSpacingHints, snapDelta, snapDeltaToGrid, snapThresholdForZoom } from "@/core/geometry/snap";
import type { SnapCandidate, SnapGuide, SnapResult, SpacingHint } from "@/core/geometry/snap";
import { chartRegistry } from "@/core/chart/registry";
import type { ChartItem, ComponentItem, ScreenItem, ChartType } from "@/core/model/types";
import ItemView from "./ItemView.vue";
import SelectionOverlay from "./SelectionOverlay.vue";
import TransformHandles from "./TransformHandles.vue";
import Icon from "@/shared/ui/Icon.vue";
import { ASSET_DND_MIME, DESIGN_DND_MIME, clearActiveCanvasDragPayload, getActiveCanvasDragPayload } from "@/shared/dnd";
import { BUILT_IN_BLOCKS, getThemeById, themeCssVariables } from "@/core/design/library";
import { parseLayoutBackgroundDragPayload } from "@/workbench/layoutBackgroundActions";
import type { AlignMode } from "@/stores/documentStore";

const ALIGN_TOOLS: Array<{ mode: AlignMode; icon: string; title: string }> = [
  { mode: "left", icon: "align-left", title: "左对齐" },
  { mode: "centerX", icon: "align-center", title: "水平居中" },
  { mode: "right", icon: "align-right", title: "右对齐" },
  { mode: "distributeH", icon: "distribute-h", title: "水平等间距" },
  { mode: "top", icon: "align-top", title: "顶对齐" },
  { mode: "centerY", icon: "align-middle", title: "垂直居中" },
  { mode: "bottom", icon: "align-bottom", title: "底对齐" },
  { mode: "distributeV", icon: "distribute-v", title: "垂直等间距" },
];

const props = withDefaults(defineProps<{
  variables?: Readonly<Record<string, unknown>>;
  onComponentEvent?: (item: ComponentItem, name: string, payload: unknown) => void;
}>(), { variables: () => ({}) });
const doc = useDocumentStore();
const ui = useUiStore();

function forwardItemEvent(item: ScreenItem, name: string, payload: unknown): void {
  if (item.kind === "component") props.onComponentEvent?.(item, name, payload);
}

const stageEl = ref<HTMLDivElement | null>(null);
const marquee = ref<{ x: number; y: number; w: number; h: number } | null>(null);
const guides = ref<SnapGuide[]>([]);
const spacingHints = ref<SpacingHint[]>([]);
const dropPreview = ref<{ frame: { x: number; y: number; w: number; h: number }; fullCanvas: boolean } | null>(null);
const panning = ref(false);

interface Point {
  x: number; y: number;
}

const items = computed<ScreenItem[]>(() => doc.items);
const selectedItems = computed<ScreenItem[]>(() =>
  doc.items.filter((i) => doc.selectedIds.includes(i.id))
);
const designThemeStyle = computed(() => themeCssVariables(getThemeById(doc.currentScreen?.themeId)));


const canvasStyle = computed<Record<string, string>>(() => ({
  width: `${doc.currentScreen?.canvas.width ?? 1920}px`,
  height: `${doc.currentScreen?.canvas.height ?? 1080}px`,
  transform: `translate(${ui.pan.x}px, ${ui.pan.y}px) scale(${ui.zoom / 100})`,
  transformOrigin: "0 0",
}));

const bgStyle = computed<Record<string, string>>(() => {
  const bg = doc.currentScreen?.canvas.background;
  if (!bg) return { background: "#FFFFFF" };
  if (bg.kind === "gradient") {
    return { background: `linear-gradient(${bg.angle}deg, ${bg.from}, ${bg.to})` };
  }
  if (bg.kind === "image") {
    return { background: `url(${bg.src}) center/cover no-repeat` };
  }
  return { background: bg.color };
});

const gridStyle = computed<Record<string, string>>(() => ({
  backgroundImage: "linear-gradient(to right, rgba(91, 151, 194, .22) 1px, transparent 1px), linear-gradient(to bottom, rgba(91, 151, 194, .22) 1px, transparent 1px)",
  backgroundSize: `${ui.gridSize}px ${ui.gridSize}px`,
}));

function onGridSizeChange(ev: Event): void {
  ui.setGridSize(Number((ev.target as HTMLSelectElement).value));
}

function canvasPoint(ev: { clientX: number; clientY: number }): Point {
  const rect = stageEl.value?.getBoundingClientRect();
  if (!rect) return { x: 0, y: 0 };
  const z = ui.zoom / 100;
  return {
    x: (ev.clientX - rect.left - ui.pan.x) / z,
    y: (ev.clientY - rect.top - ui.pan.y) / z,
  };
}

// ---- 缩放平移 ----
let spacePressed = false;
let panState: { startX: number; startY: number; panX: number; panY: number; started: boolean; clearSelectionOnClick: boolean } | null = null;
let marqueeState: { start: Point; additive: boolean } | null = null;
let moveState: { start: Point; ids: string[]; started: boolean; bounds: { x: number; y: number; w: number; h: number } | null; last?: { x: number; y: number } } | null = null;

function fitToWindow(): void {
  const rect = stageEl.value?.getBoundingClientRect();
  const canvas = doc.currentScreen?.canvas;
  if (!rect || !canvas) return;
  const z = Math.min(rect.width / canvas.width, rect.height / canvas.height) * 100;
  ui.setZoom(z * 0.92);
  ui.setPan({
    x: (rect.width - canvas.width * (ui.zoom / 100)) / 2,
    y: (rect.height - canvas.height * (ui.zoom / 100)) / 2,
  });
}

function zoomAt(clientX: number, clientY: number, nextZoom: number): void {
  const rect = stageEl.value?.getBoundingClientRect();
  if (!rect) {
    ui.setZoom(nextZoom);
    return;
  }

  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  const currentScale = ui.zoom / 100;
  const anchorX = (localX - ui.pan.x) / currentScale;
  const anchorY = (localY - ui.pan.y) / currentScale;

  ui.setZoom(nextZoom);
  const nextScale = ui.zoom / 100;
  ui.setPan({
    x: localX - anchorX * nextScale,
    y: localY - anchorY * nextScale,
  });
}

function zoomAtStageCenter(nextZoom: number): void {
  const rect = stageEl.value?.getBoundingClientRect();
  if (!rect) {
    ui.setZoom(nextZoom);
    return;
  }
  zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, nextZoom);
}

function zoomBy(delta: number): void {
  zoomAtStageCenter(ui.zoom + delta);
}

function zoomReset(): void {
  zoomAtStageCenter(100);
}

function onWheel(ev: WheelEvent): void {
  if (ev.deltaY === 0) return;
  const factor = ev.deltaY > 0 ? 0.9 : 1.1;
  zoomAt(ev.clientX, ev.clientY, ui.zoom * factor);
}

// ---- 吸附 ----
function buildCandidates(
  bbox: { x: number; y: number; w: number; h: number },
  includeEqualSpacing: boolean = true
): SnapCandidate[] {
  const out: SnapCandidate[] = [];
  const staticItems: Array<{ x: number; y: number; w: number; h: number }> = [];
  const movingX = [bbox.x, bbox.x + bbox.w / 2, bbox.x + bbox.w];
  const movingY = [bbox.y, bbox.y + bbox.h / 2, bbox.y + bbox.h];
  const statics: Array<{ x: number; y: number; w: number; h: number }> = [];
  const canvas = doc.currentScreen?.canvas;
  if (canvas) {
    statics.push({ x: 0, y: 0, w: canvas.width, h: canvas.height });
  }
  for (const it of doc.items) {
    if (moveState && moveState.ids.includes(it.id)) continue;
    if (it.hidden) continue;
    statics.push(it.frame);
    staticItems.push(it.frame);
  }
  for (const s of statics) {
    const sx = [s.x, s.x + s.w / 2, s.x + s.w];
    const sy = [s.y, s.y + s.h / 2, s.y + s.h];
    for (const m of movingX) for (const st of sx) out.push({ axis: "x", moving: m, static: st });
    for (const m of movingY) for (const st of sy) out.push({ axis: "y", moving: m, static: st });
  }
  if (includeEqualSpacing) out.push(...buildEqualSpacingCandidates(bbox, staticItems));
  return out;
}

function snapPlacementDelta(
  bounds: { x: number; y: number; w: number; h: number },
  includeEqualSpacing: boolean
): SnapResult {
  const aligned = ui.snapEnabled
    ? snapDelta(
        { dx: 0, dy: 0 },
        buildCandidates(bounds, includeEqualSpacing),
        snapThresholdForZoom(ui.zoom)
      )
    : { dx: 0, dy: 0, guides: [] as SnapGuide[] };
  if (!ui.gridSnapEnabled) return aligned;
  return {
    ...snapDeltaToGrid(aligned, bounds, ui.gridSize, new Set(aligned.guides.map((guide) => guide.axis))),
    guides: aligned.guides,
  };
}

function snapPlacementPoint(point: Point): Point {
  const bounds = { x: point.x, y: point.y, w: 0, h: 0 };
  const delta = snapPlacementDelta(bounds, false);
  return { x: point.x + delta.dx, y: point.y + delta.dy };
}

function snapPlacementFrame(frame: ScreenItem["frame"]): ScreenItem["frame"] {
  const delta = snapPlacementDelta(frame, true);
  return { ...frame, x: frame.x + delta.dx, y: frame.y + delta.dy };
}

interface PlacementPreview {
  frame: { x: number; y: number; w: number; h: number };
  guides: SnapGuide[];
  fullCanvas: boolean;
}

function clampPreviewFrame(
  frame: PlacementPreview["frame"],
  canvas: { width: number; height: number }
): PlacementPreview["frame"] {
  const w = Math.max(1, Math.min(canvas.width, frame.w));
  const h = Math.max(1, Math.min(canvas.height, frame.h));
  return {
    x: Math.max(0, Math.min(canvas.width - w, frame.x)),
    y: Math.max(0, Math.min(canvas.height - h, frame.y)),
    w,
    h,
  };
}

function framePreview(
  point: Point,
  size: { w: number; h: number },
  canvas: { width: number; height: number },
  roundPosition: boolean,
  snapAsFrame: boolean
): PlacementPreview {
  if (snapAsFrame) {
    const bounds = {
      x: Math.round(point.x - size.w / 2),
      y: Math.round(point.y - size.h / 2),
      w: size.w,
      h: size.h,
    };
    const snapped = snapPlacementDelta(bounds, true);
    return {
      frame: clampPreviewFrame({ x: bounds.x + snapped.dx, y: bounds.y + snapped.dy, w: size.w, h: size.h }, canvas),
      guides: snapped.guides,
      fullCanvas: false,
    };
  }

  const snapped = snapPlacementDelta({ x: point.x, y: point.y, w: 0, h: 0 }, false);
  const x = point.x + snapped.dx - size.w / 2;
  const y = point.y + snapped.dy - size.h / 2;
  return {
    frame: clampPreviewFrame({ x: roundPosition ? Math.round(x) : x, y: roundPosition ? Math.round(y) : y, ...size }, canvas),
    guides: snapped.guides,
    fullCanvas: false,
  };
}

function parseDragRecord(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function dragPlacementPreview(mime: string, raw: string, point: Point): PlacementPreview | null {
  const canvas = doc.currentScreen?.canvas;
  if (!canvas) return null;

  if (mime === ASSET_DND_MIME) {
    const asset = useWorkspaceStore().assets.find((entry) => entry.id === raw);
    return framePreview(point, asset?.defaultSize ?? { w: 400, h: 300 }, canvas, true, true);
  }

  if (mime === DROP_MIME) {
    const payload = parseDragRecord(raw);
    if (!payload) return null;
    const kind = payload.kind;
    if (kind !== "chart" && kind !== "text" && kind !== "image" && kind !== "shape") return null;
    return framePreview(point, { w: 400, h: 300 }, canvas, true, true);
  }

  if (mime !== DESIGN_DND_MIME) return null;
  const layoutPayload = parseLayoutBackgroundDragPayload(raw);
  if (layoutPayload?.kind === "layout-background") {
    return { frame: { x: 0, y: 0, w: canvas.width, h: canvas.height }, guides: [], fullCanvas: true };
  }
  if (layoutPayload?.kind === "layout-asset") {
    const center = { x: canvas.width / 2, y: canvas.height / 2 };
    const item = createLayoutAssetItems(layoutPayload.id, canvas, center)[0];
    return item ? framePreview(point, { w: item.frame.w, h: item.frame.h }, canvas, false, false) : null;
  }

  const payload = parseDragRecord(raw);
  if (!payload || typeof payload.id !== "string") return null;
  if (payload.kind === "component") {
    const version = typeof payload.version === "number" ? payload.version : 1;
    const definition = componentRegistry.get(payload.id, version);
    if (!definition || definition.renderer.kind !== "vue") return null;
    return framePreview(point, { w: definition.defaultFrame.w, h: definition.defaultFrame.h }, canvas, true, false);
  }
  if (payload.kind === "block") {
    const block = BUILT_IN_BLOCKS.find((entry) => entry.id === payload.id);
    if (!block || block.items.length === 0) return null;
    const minX = Math.min(...block.items.map((item) => item.frame.x));
    const minY = Math.min(...block.items.map((item) => item.frame.y));
    const maxX = Math.max(...block.items.map((item) => item.frame.x + item.frame.w));
    const maxY = Math.max(...block.items.map((item) => item.frame.y + item.frame.h));
    return framePreview(point, { w: maxX - minX, h: maxY - minY }, canvas, false, false);
  }
  if (payload.kind === "design-asset") {
    return framePreview(point, { w: 400, h: 300 }, canvas, false, false);
  }
  return null;
}

function clearDropPreview(): void {
  dropPreview.value = null;
  guides.value = [];
  spacingHints.value = [];
}

function onStageDragOver(ev: DragEvent): void {
  if (ui.previewing) {
    clearDropPreview();
    return;
  }
  const active = getActiveCanvasDragPayload();
  const types = Array.from(ev.dataTransfer?.types ?? []);
  if (!active || (types.length > 0 && !types.includes(active.mime))) {
    clearDropPreview();
    return;
  }
  const preview = dragPlacementPreview(active.mime, active.data, canvasPoint(ev));
  if (!preview) {
    clearDropPreview();
    return;
  }
  dropPreview.value = { frame: preview.frame, fullCanvas: preview.fullCanvas };
  guides.value = preview.guides;
  spacingHints.value = [];
}

function onStageDragLeave(ev: DragEvent): void {
  const next = ev.relatedTarget;
  if (next instanceof Node && stageEl.value?.contains(next)) return;
  clearDropPreview();
}

function onCanvasDragEnd(): void {
  clearActiveCanvasDragPayload();
  clearDropPreview();
}

function selectionBBox(ids: string[]): { x: number; y: number; w: number; h: number } | null {
  const sel = doc.items.filter((i) => ids.includes(i.id));
  if (sel.length === 0) return null;
  const minX = Math.min(...sel.map((i) => i.frame.x));
  const minY = Math.min(...sel.map((i) => i.frame.y));
  const maxX = Math.max(...sel.map((i) => i.frame.x + i.frame.w));
  const maxY = Math.max(...sel.map((i) => i.frame.y + i.frame.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

const DISTANCE_HINT_MAX_SCREEN = 180;

function updateSpacingHints(bounds: { x: number; y: number; w: number; h: number }, movingIds: string[]): void {
  const staticFrames = doc.items
    .filter((item) => !movingIds.includes(item.id) && !item.hidden)
    .map((item) => item.frame);
  spacingHints.value = findNearestSpacingHints(
    bounds,
    staticFrames,
    DISTANCE_HINT_MAX_SCREEN / (ui.zoom / 100)
  );
}

function spacingHintStyle(hint: SpacingHint): Record<string, string> {
  if (hint.axis === "x") {
    return {
      left: `${Math.min(hint.from, hint.to)}px`,
      top: `${hint.cross}px`,
      width: `${Math.abs(hint.to - hint.from)}px`,
    };
  }
  return {
    left: `${hint.cross}px`,
    top: `${Math.min(hint.from, hint.to)}px`,
    height: `${Math.abs(hint.to - hint.from)}px`,
  };
}

function clampTranslation(delta: number, start: number, size: number, canvasSize: number): number {
  const min = -start;
  const max = canvasSize - start - size;
  if (max < min) return min;
  return Math.max(min, Math.min(max, delta));
}

// ---- 指针交互 ----
function onWindowMove(ev: MouseEvent): void {
  if (panState) {
    const dx = ev.clientX - panState.startX;
    const dy = ev.clientY - panState.startY;
    if (!panState.started && Math.hypot(dx, dy) < 3) return;
    panState.started = true;
    panning.value = true;
    ui.setPan({ x: panState.panX + dx, y: panState.panY + dy });
    return;
  }
  if (marqueeState) {
    const cur = canvasPoint(ev);
    const s = marqueeState.start;
    marquee.value = {
      x: Math.min(s.x, cur.x),
      y: Math.min(s.y, cur.y),
      w: Math.abs(cur.x - s.x),
      h: Math.abs(cur.y - s.y),
    };
    return;
  }
  if (moveState) {
    const cur = canvasPoint(ev);
    const rawDx = cur.x - moveState.start.x;
    const rawDy = cur.y - moveState.start.y;
    if (!moveState.started && Math.hypot(rawDx, rawDy) < 3) return;
    moveState.started = true;
    let dx = rawDx;
    let dy = rawDy;
    if (moveState.bounds) {
      const aligned = ui.snapEnabled
        ? snapDelta(
            { dx, dy },
            buildCandidates(moveState.bounds),
            snapThresholdForZoom(ui.zoom)
          )
        : { dx, dy, guides: [] as SnapGuide[] };
      const snapped = ui.gridSnapEnabled
        ? snapDeltaToGrid(
            aligned,
            moveState.bounds,
            ui.gridSize,
            new Set(aligned.guides.map((guide) => guide.axis))
          )
        : aligned;
      dx = snapped.dx;
      dy = snapped.dy;
      guides.value = aligned.guides;
    } else {
      guides.value = [];
    }
    const canvas = doc.currentScreen?.canvas;
    if (canvas && moveState.bounds) {
      dx = clampTranslation(dx, moveState.bounds.x, moveState.bounds.w, canvas.width);
      dy = clampTranslation(dy, moveState.bounds.y, moveState.bounds.h, canvas.height);
    }
    // 以增量方式移动（相对上次位置）
    const last = moveState.last ?? { x: 0, y: 0 };
    doc.moveBy(moveState.ids, dx - last.x, dy - last.y, { commit: false });
    moveState.last = { x: dx, y: dy };
    if (moveState.bounds) {
      const bounds = moveState.bounds;
      updateSpacingHints(
        { x: bounds.x + dx, y: bounds.y + dy, w: bounds.w, h: bounds.h },
        moveState.ids
      );
    } else {
      spacingHints.value = [];
    }

  }
}

function onWindowUp(): void {
  if (marqueeState && marquee.value) {
    const hits = boxSelect(doc.items, marquee.value);
    const ids = hits.filter((i) => !i.hidden && !i.locked).map((i) => i.id);
    doc.selectedIds = marqueeState.additive
      ? [...new Set([...doc.selectedIds, ...ids])]
      : ids;
  }
  if (moveState && moveState.started) {
    doc.commit();
  }
  if (panState?.clearSelectionOnClick && !panState.started) {
    doc.selectedIds = [];
  }
  marqueeState = null;
  marquee.value = null;
  panState = null;
  panning.value = false;
  moveState = null;
  guides.value = [];
  spacingHints.value = [];
  window.removeEventListener("mousemove", onWindowMove);
  window.removeEventListener("mouseup", onWindowUp);
}

function onCanvasBackgroundDown(ev: MouseEvent): void {
  if (ev.button === 0 && ev.shiftKey && !spacePressed) {
    ev.preventDefault();
    marqueeState = { start: canvasPoint(ev), additive: true };
  } else if (ev.button === 0 || ev.button === 1) {
    ev.preventDefault();
    panState = {
      startX: ev.clientX,
      startY: ev.clientY,
      panX: ui.pan.x,
      panY: ui.pan.y,
      started: false,
      clearSelectionOnClick: ev.button === 0 && !ev.shiftKey && !spacePressed,
    };
  } else {
    return;
  }
  window.addEventListener("mousemove", onWindowMove);
  window.addEventListener("mouseup", onWindowUp);
}

function onStageDown(ev: MouseEvent): void {
  const onGrayBackground = ev.target === ev.currentTarget;
  const panGesture =
    ev.button === 1 ||
    (ev.button === 0 && (spacePressed || (onGrayBackground && !ev.shiftKey)));

  if (panGesture) {
    ev.preventDefault();
    panState = {
      startX: ev.clientX,
      startY: ev.clientY,
      panX: ui.pan.x,
      panY: ui.pan.y,
      started: false,
      clearSelectionOnClick: ev.button === 0 && onGrayBackground && !spacePressed,
    };
  } else if (ev.button === 0) {
    marqueeState = { start: canvasPoint(ev), additive: ev.shiftKey };
    if (!ev.shiftKey) doc.selectedIds = [];
  } else {
    return;
  }
  window.addEventListener("mousemove", onWindowMove);
  window.addEventListener("mouseup", onWindowUp);
}

function onItemDblclick(_ev: MouseEvent, item: ScreenItem): void {
  if (item.kind === "chart" && !item.locked && !item.hidden) {
    ui.setEditing(item.id);
  }
}

function onItemClick(ev: MouseEvent, item: ScreenItem): void {
  if (item.locked || item.hidden) return;
  ev.stopPropagation();
  const groupIds = item.groupId
    ? doc.items.filter((i) => i.groupId === item.groupId).map((i) => i.id)
    : [item.id];
  if (ev.shiftKey) {
    const allIn = groupIds.every((id) => doc.selectedIds.includes(id));
    doc.selectedIds = allIn
      ? doc.selectedIds.filter((id) => !groupIds.includes(id))
      : [...new Set([...doc.selectedIds, ...groupIds])];
  } else if (!doc.selectedIds.includes(item.id)) {
    doc.selectedIds = groupIds;
  }
  if (!ev.shiftKey && doc.selectedIds.includes(item.id)) {
    const ids = [...doc.selectedIds];
    moveState = { start: canvasPoint(ev), ids, started: false, bounds: selectionBBox(ids) };
  }
  window.addEventListener("mousemove", onWindowMove);
  window.addEventListener("mouseup", onWindowUp);
}

// ---- 键盘 ----
function isTypingTarget(ev: KeyboardEvent): boolean {
  const t = ev.target as HTMLElement | null;
  if (!t) return false;
  return (
    t.tagName === "INPUT" ||
    t.tagName === "TEXTAREA" ||
    t.tagName === "SELECT" ||
    t.isContentEditable
  );
}

function onKeyDown(ev: KeyboardEvent): void {
  if (ev.code === "Space") {
    spacePressed = true;
    if (!isTypingTarget(ev)) ev.preventDefault();
    return;
  }
  if (isTypingTarget(ev)) return;
  const step = arrowNudgeStep(ui.gridSnapEnabled, ui.gridSize, ev.shiftKey);
  const ctrl = ev.ctrlKey || ev.metaKey;
  if (ctrl && !ev.shiftKey && ev.key.toLowerCase() === "z") {
    ev.preventDefault();
    doc.undo();
  } else if (ctrl && (ev.key.toLowerCase() === "y" || (ev.shiftKey && ev.key.toLowerCase() === "z"))) {
    ev.preventDefault();
    doc.redo();
  } else if (ctrl && ev.key.toLowerCase() === "c") {
    doc.copy();
  } else if (ctrl && ev.key.toLowerCase() === "v") {
    doc.paste();
  } else if (ctrl && ev.key.toLowerCase() === "d") {
    ev.preventDefault();
    doc.duplicate();
  } else if (ctrl && ev.shiftKey && ev.key.toLowerCase() === "g") {
    ev.preventDefault();
    doc.ungroup();
  } else if (ctrl && ev.key.toLowerCase() === "g") {
    ev.preventDefault();
    doc.addGroup();
  } else if (ev.key === "Delete" || ev.key === "Backspace") {
    if (doc.selectedIds.length > 0) {
      ev.preventDefault();
      doc.removeItems([...doc.selectedIds]);
    }
  } else if (ev.key.startsWith("Arrow") && doc.selectedIds.length > 0) {
    ev.preventDefault();
    const dx = ev.key === "ArrowLeft" ? -step : ev.key === "ArrowRight" ? step : 0;
    const dy = ev.key === "ArrowUp" ? -step : ev.key === "ArrowDown" ? step : 0;
    doc.moveBy([...doc.selectedIds], dx, dy);
  } else if (ctrl && ev.key === "0") {
    ev.preventDefault();
    fitToWindow();
  } else if (ctrl && ev.key === "1") {
    ev.preventDefault();
    zoomAtStageCenter(100);
  } else if (ctrl && (ev.key === "=" || ev.key === "+")) {
    ev.preventDefault();
    zoomBy(10);
  } else if (ctrl && ev.key === "-") {
    ev.preventDefault();
    zoomBy(-10);
  } else if (ev.key === "?") {
    ui.setHelpVisible(!ui.helpVisible);
  } else if (ev.key === "Escape") {
    if (ui.editingId) {
      ui.setEditing(null);
    } else {
      doc.selectedIds = [];
    }
  }
}

function onKeyUp(ev: KeyboardEvent): void {
  if (ev.code === "Space") spacePressed = false;
}

window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);
window.addEventListener("dragend", onCanvasDragEnd, true);
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeyDown);
  window.removeEventListener("keyup", onKeyUp);
  window.removeEventListener("dragend", onCanvasDragEnd, true);
});

// ---- 拖入落位 ----
const DROP_MIME = "application/x-chartforge-item";

interface DropPayload {
  kind: ScreenItem["kind"];
  chartType?: ChartType;
  assetId?: string;
}

function onDrop(ev: DragEvent): void {
  clearActiveCanvasDragPayload();
  clearDropPreview();
  const designRaw = ev.dataTransfer?.getData(DESIGN_DND_MIME);
  if (designRaw) {
    const backgroundPayload = parseLayoutBackgroundDragPayload(designRaw);
    if (backgroundPayload) {
      if (backgroundPayload.kind === "layout-background") {
        doc.insertLayoutBackground(backgroundPayload.id);
      } else {
        doc.insertLayoutAsset(backgroundPayload.id, snapPlacementPoint(canvasPoint(ev)));
      }
      return;
    }

    try {
      const payload = JSON.parse(designRaw) as { kind?: string; id?: string; version?: number };
      const position = snapPlacementPoint(canvasPoint(ev));
      if (payload.kind === "component" && payload.id) doc.addComponent(payload.id, payload.version ?? 1, position);
      else if (payload.kind === "block" && payload.id) doc.insertBlock(payload.id, position);
      else if (payload.kind === "design-asset" && payload.id) doc.addDesignAssetImage(payload.id, position);
    } catch {
      // Ignore invalid design-library drag payloads.
    }
    return;
  }
  // 图表资产（图表库拖拽源）→ 以落点为中心放置副本
  const assetId = ev.dataTransfer?.getData(ASSET_DND_MIME);
  if (assetId) {
    const pt = canvasPoint(ev);
    const asset = useWorkspaceStore().assets.find((a) => a.id === assetId);
    const size = asset?.defaultSize ?? { w: 400, h: 300 };
    const frame = snapPlacementFrame({
      x: Math.round(pt.x - size.w / 2),
      y: Math.round(pt.y - size.h / 2),
      w: size.w,
      h: size.h,
      rotate: 0,
    });
    doc.placeAsset(assetId, { x: frame.x, y: frame.y, w: size.w, h: size.h });
    return;
  }
  const raw = ev.dataTransfer?.getData(DROP_MIME);
  if (!raw) return;
  let payload: DropPayload;
  try {
    payload = JSON.parse(raw) as DropPayload;
  } catch {
    return;
  }
  const pt = canvasPoint(ev);
  let item: ScreenItem;
  if (payload.kind === "chart") {
    const type = payload.chartType ?? "line";
    let spec = chartRegistry[type].defaultSpec();
    let sourceAssetId: string | undefined;
    if (payload.assetId) {
      const asset = useWorkspaceStore().assets.find((a) => a.id === payload.assetId);
      if (asset) {
        spec = JSON.parse(JSON.stringify(asset.spec));
        sourceAssetId = asset.id;
      }
    }
    const created = createItem(
      "chart",
      { x: Math.round(pt.x - 200), y: Math.round(pt.y - 150) },
      spec
    ) as ChartItem;
    if (sourceAssetId) created.sourceAssetId = sourceAssetId;
    item = created;
  } else if (payload.kind === "text") {
    item = createItem("text", { x: Math.round(pt.x - 80), y: Math.round(pt.y - 16) });
  } else if (payload.kind === "image") {
    item = createItem("image", { x: Math.round(pt.x - 120), y: Math.round(pt.y - 80) });
  } else {
    item = createItem("shape", { x: Math.round(pt.x - 80), y: Math.round(pt.y - 50) });
  }
  item.frame = snapPlacementFrame(item.frame);
  doc.addItem(item);
}

defineExpose({ canvasPoint, DROP_MIME });
</script>

<template>
  <div
    ref="stageEl"
    class="canvas-stage"
    :class="{ 'canvas-stage--panning': panning }"
    tabindex="0"
    @wheel.prevent="onWheel"
    @mousedown="onStageDown"
    @dragover.prevent="onStageDragOver"
    @dragleave="onStageDragLeave"
    @drop.prevent="onDrop"
  >
    <div v-if="!ui.previewing" class="canvas-stage__zoom-bar" @mousedown.stop>
      <button class="cf-button cf-button--plain cf-button--small canvas-stage__tool-btn" title="缩小" @click="zoomBy(-10)">−</button>
      <span class="canvas-stage__zoom-label">{{ ui.zoom }}%</span>
      <button class="cf-button cf-button--plain cf-button--small canvas-stage__tool-btn" title="放大" @click="zoomBy(10)">＋</button>
      <span class="canvas-stage__tool-sep" />
      <button class="cf-button cf-button--plain cf-button--small canvas-stage__tool-btn" title="适应窗口" @click="fitToWindow">适应</button>
      <button class="cf-button cf-button--plain cf-button--small canvas-stage__tool-btn" title="恢复 100%" @click="zoomReset">100%</button>
      <span class="canvas-stage__tool-sep" />
      <span class="canvas-stage__pan-hint">灰色区域也可拖动平移</span>
    </div>
    <div class="canvas-stage__canvas" :style="canvasStyle">
      <div class="canvas-stage__content" :style="designThemeStyle">
        <div class="canvas-stage__bg" :style="bgStyle" title="拖动空白画布以平移视图" @mousedown.stop="onCanvasBackgroundDown" />
        <div v-if="ui.gridEnabled && !ui.previewing" class="canvas-stage__grid" :style="gridStyle" aria-hidden="true" />
        <ItemView
          v-for="item in items"
          :key="item.id"
          :item="item"
          :variables="props.variables"
          :emit-event="(name, payload) => forwardItemEvent(item, name, payload)"
          @mousedown.stop="onItemClick($event, item)"
          @dblclick.stop="onItemDblclick($event, item)"
        />
      </div>
      <SelectionOverlay :selected="selectedItems" :marquee="marquee" />
      <div
        v-if="dropPreview && !ui.previewing"
        class="canvas-stage__drop-preview"
        :class="{ 'canvas-stage__drop-preview--canvas': dropPreview.fullCanvas }"
        :style="{
          left: `${dropPreview.frame.x}px`,
          top: `${dropPreview.frame.y}px`,
          width: `${dropPreview.frame.w}px`,
          height: `${dropPreview.frame.h}px`,
        }"
        aria-hidden="true"
        data-ui-only
      />
      <Teleport to=".canvas-stage">
        <div
          v-if="!ui.previewing"
          class="canvas-stage__toolbar"
          role="toolbar"
          aria-label="画布排列辅助工具"
          data-ui-only
          @mousedown.stop
          @wheel.stop
        >
          <button
            class="cf-button cf-button--plain cf-button--small canvas-stage__tool-btn"
            :class="{ 'canvas-stage__tool-btn--on': ui.snapEnabled }"
            :aria-pressed="ui.snapEnabled"
            aria-label="智能参考线吸附开关"
            title="与画布边缘、中心及其他元素对齐（按屏幕距离触发）"
            @click="ui.setSnapEnabled(!ui.snapEnabled)"
          >
            参考线
          </button>
          <button
            class="cf-button cf-button--plain cf-button--small canvas-stage__tool-btn"
            :class="{ 'canvas-stage__tool-btn--on': ui.gridEnabled }"
            :aria-pressed="ui.gridEnabled"
            aria-label="显示对齐网格"
            title="显示或隐藏画布网格"
            @click="ui.setGridEnabled(!ui.gridEnabled)"
          >
            网格
          </button>
          <label class="canvas-stage__grid-size">
            <span>步长</span>
            <select
              class="cf-control cf-control--compact"
              aria-label="网格间距"
              :value="ui.gridSize"
              @change="onGridSizeChange"
            >
              <option v-for="size in GRID_SIZE_OPTIONS" :key="size" :value="size">{{ size }} px</option>
            </select>
          </label>
          <button
            class="cf-button cf-button--plain cf-button--small canvas-stage__tool-btn"
            :class="{ 'canvas-stage__tool-btn--on': ui.gridSnapEnabled }"
            :aria-pressed="ui.gridSnapEnabled"
            aria-label="网格吸附开关"
            title="将选中元素吸附到网格步长"
            @click="ui.setGridSnapEnabled(!ui.gridSnapEnabled)"
          >
            步进吸附
          </button>
          <template v-if="doc.selectedIds.length > 1">
            <span class="canvas-stage__tool-sep" />
            <button
              v-for="t in ALIGN_TOOLS"
              :key="t.mode"
              class="cf-button cf-button--plain cf-button--small canvas-stage__tool-btn"
              :title="t.title"
              :aria-label="t.title"
              @click="doc.alignDistribute(t.mode)"
            >
              <Icon :name="t.icon" :size="14" />
            </button>
            <span class="canvas-stage__tool-sep" />
            <button class="cf-button cf-button--plain cf-button--small canvas-stage__tool-btn" title="组合 (Ctrl+G)" @click="doc.addGroup()">
              <Icon name="group" :size="14" />
            </button>
            <button class="cf-button cf-button--plain cf-button--small canvas-stage__tool-btn" title="取消组合 (Ctrl+Shift+G)" @click="doc.ungroup()">
              <Icon name="close" :size="14" />
            </button>
          </template>
          <template v-if="doc.selectedIds.length > 0">
            <span class="canvas-stage__tool-sep" />
            <button
              class="cf-button cf-button--plain cf-button--small cf-button--danger canvas-stage__tool-btn canvas-stage__tool-btn--danger"
              title="删除选中元素 (Delete)"
              @click="doc.removeItems([...doc.selectedIds])"
            >
              <Icon name="trash" :size="14" /> 删除
            </button>
          </template>
        </div>
      </Teleport>
      <template v-if="!ui.previewing">
        <div
          v-for="(g, i) in guides"
          :key="`g${i}`"
          class="canvas-stage__guide"
          :style="
            g.axis === 'x'
              ? { left: `${g.position}px`, top: '0', width: '1px', height: '100%' }
              : { left: '0', top: `${g.position}px`, width: '100%', height: '1px' }
          "
        data-ui-only
        />
        <div
          v-for="(hint, i) in spacingHints"
          :key="`distance-${i}`"
          class="canvas-stage__measure"
          :class="`canvas-stage__measure--${hint.axis}`"
          :style="spacingHintStyle(hint)"
          aria-hidden="true"
          data-ui-only
        >
          <span>{{ Math.round(hint.distance) }} px</span>
        </div>
        <TransformHandles
          v-if="selectedItems.length > 0"
          :items="selectedItems"
          :zoom="ui.zoom"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.canvas-stage {
  position: relative;
  flex: 1;
  overflow: hidden;
  background: var(--cf-canvas-bg, #e9ebf0);
  outline: none;
}
.canvas-stage__canvas {
  position: absolute;
  left: 0;
  top: 0;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
}
.canvas-stage__content {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.canvas-stage__bg {
  position: absolute;
  inset: 0;
  pointer-events: auto;
  cursor: grab;
}
.canvas-stage__grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-position: 0 0;
}
.canvas-stage--panning .canvas-stage__bg {
  cursor: grabbing;
}
.canvas-stage__drop-preview {
  position: absolute;
  z-index: 4;
  box-sizing: border-box;
  border: 2px dashed #29d3ff;
  border-radius: 4px;
  background: rgba(41, 211, 255, 0.12);
  box-shadow: 0 0 0 1px rgba(9, 42, 58, 0.25);
  pointer-events: none;
}
.canvas-stage__drop-preview--canvas {
  border-radius: 0;
  background: rgba(41, 211, 255, 0.025);
}
.canvas-stage__guide {
  position: absolute;
  background: #f5222d;
  pointer-events: none;
}
.canvas-stage__measure {
  position: absolute;
  pointer-events: none;
  border-color: #f5bd4f;
}
.canvas-stage__measure--x {
  height: 0;
  border-top: 1px dashed #f5bd4f;
}
.canvas-stage__measure--y {
  width: 0;
  border-left: 1px dashed #f5bd4f;
}
.canvas-stage__measure span {
  position: absolute;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(18, 27, 39, 0.92);
  color: #ffd36a;
  font-size: 10px;
  line-height: 1.4;
  white-space: nowrap;
}
.canvas-stage__measure--x span {
  left: 50%;
  top: -4px;
  transform: translate(-50%, -100%);
}
.canvas-stage__measure--y span {
  left: 5px;
  top: 50%;
  transform: translateY(-50%);
}
.canvas-stage__zoom-bar {
  position: absolute;
  left: 12px;
  bottom: 12px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 5px 8px;
  border-radius: 8px;
  background: var(--cf-panel);
  box-shadow: var(--cf-shadow);
  border: 1px solid var(--cf-border);
}
.canvas-stage__zoom-label {
  min-width: 44px;
  text-align: center;
  font-size: 12px;
  color: var(--cf-text-2);
}
.canvas-stage__pan-hint {
  padding: 0 4px;
  color: var(--cf-text-2);
  font-size: 11px;
  white-space: nowrap;
}
.canvas-stage__toolbar {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: center;
  max-width: calc(100% - 24px);
  max-height: calc(100% - 24px);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--cf-panel);
  box-shadow: var(--cf-shadow);
  border: 1px solid var(--cf-border);
}
.canvas-stage__grid-size {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--cf-text-2);
  font-size: 11px;
  white-space: nowrap;
}
.canvas-stage__grid-size select {
  width: 74px;
  min-height: 28px;
}
.canvas-stage__tool-btn--danger:hover {
  background: color-mix(in srgb, var(--cf-danger) 12%, transparent);
  color: var(--cf-danger);
}
.canvas-stage__tool-btn--on {
  background: color-mix(in srgb, var(--cf-primary) 15%, transparent);
  color: var(--cf-primary);
}
.canvas-stage__tool-sep {
  width: 1px;
  height: 16px;
  background: var(--cf-border);
}
</style>
