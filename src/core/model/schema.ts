import type {
  Background,
  ChartAsset,
  ChartData,
  ChartItem,
  ChartSpec,
  ChartType,
  Frame,
  ImageItem,
  ImageSpec,
  Screen,
  ScreenItem,
  ShapeItem,
  ShapeSpec,
  TextItem,
  TextSpec,
  Workspace,
} from "./types";

export const DEFAULT_FRAME: Frame = { x: 100, y: 100, w: 400, h: 300, rotate: 0 };
export const DEFAULT_BACKGROUND: Background = { kind: "color", color: "#FFFFFF" };
export const DEFAULT_SCREEN_NAME = "未命名大屏";
export const CANVAS_SIZE = { width: 1920, height: 1080 } as const;

const CHART_TYPES: readonly ChartType[] = ["line", "bar", "pie", "map", "scatter", "radar"];
const ITEM_KINDS = ["chart", "text", "image", "shape"] as const;

function uuid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown, d: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : d;
}

function str(v: unknown, d: string): string {
  return typeof v === "string" ? v : d;
}

function emptyDataFor(type: ChartType): ChartData {
  switch (type) {
    case "pie":
    case "map":
      return { kind: "nameValue", rows: [] };
    case "scatter":
      return { kind: "xy", rows: [] };
    case "radar":
      return { kind: "radar", indicators: [], series: [] };
    default:
      return { kind: "category", categories: [], series: [] };
  }
}

export function createWorkspace(): Workspace {
  return { version: 1, assets: [], screens: [], settings: { autosave: true } };
}

export function createScreen(name: string, canvas?: { width: number; height: number }): Screen {
  return {
    id: uuid(),
    name,
    canvas: {
      width: canvas?.width ?? CANVAS_SIZE.width,
      height: canvas?.height ?? CANVAS_SIZE.height,
      background: { ...DEFAULT_BACKGROUND },
    },
    items: [],
    updatedAt: Date.now(),
  };
}

export function createChartSpec(type: ChartType): ChartSpec {
  return { type, option: {}, data: emptyDataFor(type) };
}

export function createChartAsset(name: string, spec: ChartSpec): ChartAsset {
  const now = Date.now();
  return { id: uuid(), name, thumbnail: "", spec, createdAt: now, updatedAt: now };
}

export function createItem(
  kind: ScreenItem["kind"],
  frame: Partial<Frame> = {},
  spec?: ChartSpec
): ScreenItem {
  const base = { id: uuid(), frame: { ...DEFAULT_FRAME, ...frame } };
  switch (kind) {
    case "chart": {
      const item: ChartItem = {
        ...base,
        name: "图表",
        kind: "chart",
        spec: spec ?? createChartSpec("line"),
      };
      return item;
    }
    case "text": {
      const text: TextSpec = {
        text: "文本",
        fontSize: 24,
        color: "#333333",
        align: "left",
        weight: "normal",
      };
      const item: TextItem = { ...base, name: "文本", kind: "text", ...text };
      return item;
    }
    case "image": {
      const image: ImageSpec = { src: "", fit: "contain" };
      const item: ImageItem = { ...base, name: "图片", kind: "image", ...image };
      return item;
    }
    default: {
      const shape: ShapeSpec = { shape: "rect", fill: "#5470C6" };
      const item: ShapeItem = { ...base, name: "形状", kind: "shape", ...shape };
      return item;
    }
  }
}

function normalizeFrame(raw: unknown): Frame {
  const r = isRecord(raw) ? raw : {};
  return {
    x: num(r.x, DEFAULT_FRAME.x),
    y: num(r.y, DEFAULT_FRAME.y),
    w: Math.max(8, num(r.w, DEFAULT_FRAME.w)),
    h: Math.max(8, num(r.h, DEFAULT_FRAME.h)),
    rotate: num(r.rotate, 0),
  };
}

function normalizeBackground(raw: unknown): Background {
  if (isRecord(raw)) {
    if (raw.kind === "gradient") {
      return {
        kind: "gradient",
        from: str(raw.from, "#FFFFFF"),
        to: str(raw.to, "#000000"),
        angle: num(raw.angle, 180),
      };
    }
    if (raw.kind === "image") {
      return { kind: "image", src: str(raw.src, "") };
    }
    return { kind: "color", color: str(raw.color, "#FFFFFF") };
  }
  return { ...DEFAULT_BACKGROUND };
}

const DATA_KINDS = ["category", "nameValue", "xy", "radar"] as const;

function normalizeData(raw: unknown, type: ChartType): ChartData {
  if (isRecord(raw) && (DATA_KINDS as readonly string[]).includes(str(raw.kind, ""))) {
    return raw as unknown as ChartData;
  }
  return emptyDataFor(type);
}

function normalizeSpec(raw: unknown): ChartSpec {
  const r = isRecord(raw) ? raw : {};
  const typeRaw = str(r.type, "line");
  const type = (CHART_TYPES as readonly string[]).includes(typeRaw)
    ? (typeRaw as ChartType)
    : "line";
  const option = isRecord(r.option) ? (r.option as Record<string, unknown>) : {};
  const data = normalizeData(r.data, type);
  const sourceRaw = r.source;
  if (isRecord(sourceRaw) && typeof sourceRaw.url === "string") {
    return {
      type,
      option,
      data,
      source: {
        url: sourceRaw.url,
        intervalSec: num(sourceRaw.intervalSec, 30),
        ...(typeof sourceRaw.dataPath === "string" ? { dataPath: sourceRaw.dataPath } : {}),
      },
    };
  }
  return { type, option, data };
}

function normalizeItem(raw: unknown): ScreenItem | null {
  if (!isRecord(raw)) return null;
  const kind = str(raw.kind, "");
  if (!(ITEM_KINDS as readonly string[]).includes(kind)) return null;
  const base = {
    id: str(raw.id, uuid()),
    name: str(raw.name, ""),
    frame: normalizeFrame(raw.frame),
    ...(typeof raw.locked === "boolean" ? { locked: raw.locked } : {}),
    ...(typeof raw.hidden === "boolean" ? { hidden: raw.hidden } : {}),
    ...(typeof raw.opacity === "number" ? { opacity: raw.opacity } : {}),
    ...(typeof raw.groupId === "string" ? { groupId: raw.groupId } : {}),
  };
  switch (kind) {
    case "chart":
      return { ...base, kind: "chart", spec: normalizeSpec(raw.spec) } satisfies ChartItem;
    case "text":
      return {
        ...base,
        kind: "text",
        text: str(raw.text, "文本"),
        fontSize: num(raw.fontSize, 24),
        color: str(raw.color, "#333333"),
        align: raw.align === "center" || raw.align === "right" ? raw.align : "left",
        weight: raw.weight === "bold" ? "bold" : "normal",
        ...(typeof raw.lineHeight === "number" ? { lineHeight: raw.lineHeight } : {}),
      } satisfies TextItem;
    case "image":
      return {
        ...base,
        kind: "image",
        src: str(raw.src, ""),
        fit: raw.fit === "cover" || raw.fit === "fill" ? raw.fit : "contain",
      } satisfies ImageItem;
    default:
      return {
        ...base,
        kind: "shape",
        shape: raw.shape === "ellipse" || raw.shape === "line" ? raw.shape : "rect",
        ...(typeof raw.fill === "string" ? { fill: raw.fill } : {}),
        ...(typeof raw.stroke === "string" ? { stroke: raw.stroke } : {}),
        ...(typeof raw.strokeWidth === "number" ? { strokeWidth: raw.strokeWidth } : {}),
        ...(typeof raw.radius === "number" ? { radius: raw.radius } : {}),
      } satisfies ShapeItem;
  }
}

function normalizeScreen(raw: unknown): Screen | null {
  if (!isRecord(raw)) return null;
  const canvasRaw = isRecord(raw.canvas) ? raw.canvas : {};
  const itemsRaw = Array.isArray(raw.items) ? raw.items : [];
  const screen: Screen = {
    id: str(raw.id, uuid()),
    name: str(raw.name, DEFAULT_SCREEN_NAME) || DEFAULT_SCREEN_NAME,
    canvas: {
      width:
        typeof canvasRaw.width === "number" && canvasRaw.width >= 320 && canvasRaw.width <= 7680
          ? canvasRaw.width
          : CANVAS_SIZE.width,
      height:
        typeof canvasRaw.height === "number" && canvasRaw.height >= 320 && canvasRaw.height <= 7680
          ? canvasRaw.height
          : CANVAS_SIZE.height,
      background: normalizeBackground(canvasRaw.background),
    },
    items: itemsRaw
      .map((it) => normalizeItem(it))
      .filter((it): it is ScreenItem => it !== null),
    updatedAt: num(raw.updatedAt, 0),
    ...(typeof raw.thumbnail === "string" ? { thumbnail: raw.thumbnail } : {}),
    ...(typeof raw.category === "string" ? { category: raw.category } : {}),
    ...(Array.isArray(raw.tags) ? { tags: raw.tags.filter((t): t is string => typeof t === "string") } : {}),
  };
  return screen;
}

function normalizeAssetSize(raw: unknown): { w: number; h: number } | undefined {
  if (!isRecord(raw)) return undefined;
  const w = raw.w;
  const h = raw.h;
  if (typeof w !== "number" || typeof h !== "number") return undefined;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) return undefined;
  return { w, h };
}

function normalizeAsset(raw: unknown): ChartAsset | null {
  if (!isRecord(raw)) return null;
  const defaultSize = normalizeAssetSize(raw.defaultSize);
  return {
    id: str(raw.id, uuid()),
    name: str(raw.name, "未命名图表"),
    thumbnail: str(raw.thumbnail, ""),
    spec: normalizeSpec(raw.spec),
    ...(typeof raw.category === "string" ? { category: raw.category } : {}),
    ...(Array.isArray(raw.tags)
      ? { tags: raw.tags.filter((t): t is string => typeof t === "string") }
      : {}),
    ...(defaultSize ? { defaultSize } : {}),
    createdAt: num(raw.createdAt, 0),
    updatedAt: num(raw.updatedAt, 0),
  };
}

export function normalizeWorkspace(raw: unknown): Workspace {
  if (!isRecord(raw)) return createWorkspace();
  const assetsRaw = Array.isArray(raw.assets) ? raw.assets : [];
  const screensRaw = Array.isArray(raw.screens) ? raw.screens : [];
  const settingsRaw = isRecord(raw.settings) ? raw.settings : {};
  return {
    version: 1,
    assets: assetsRaw.map((a) => normalizeAsset(a)).filter((a): a is ChartAsset => a !== null),
    screens: screensRaw.map((s) => normalizeScreen(s)).filter((s): s is Screen => s !== null),
    settings: { autosave: settingsRaw.autosave !== false },
  };
}
