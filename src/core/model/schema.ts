import type {
  ApiSettings,
  Background,
  ChartAsset,
  ChartData,
  ChartItem,
  ChartSpec,
  ChartType,
  ComponentItem,
  DatasetBinding,
  Frame,
  ImageItem,
  ImageSpec,
  LiveSource,
  Screen,
  ScreenItem,
  ShapeItem,
  ShapeSpec,
  TextItem,
  TextSpec,
  Workspace,
} from "./types";
import type { ComponentDefinition } from "../components/types";
import { initialChartData } from "../chart/chartData";

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

/** 每个新图表都自带初始示例数据，避免打开就是空白图 */
function initialDataFor(type: ChartType): ChartData {
  return initialChartData(type);
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
  return { type, option: {}, data: initialDataFor(type) };
}

export function createChartAsset(name: string, spec: ChartSpec): ChartAsset {
  const now = Date.now();
  return { id: uuid(), name, thumbnail: "", spec, createdAt: now, updatedAt: now };
}

export function createItem(
  kind: Exclude<ScreenItem["kind"], "component">,
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

export function createComponentItem(
  definition: ComponentDefinition,
  frame: Partial<Frame> = {}
): ComponentItem {
  const props = JSON.parse(JSON.stringify(definition.defaults)) as Record<string, unknown>;
  return {
    id: uuid(),
    name: definition.name,
    kind: "component",
    componentId: definition.id,
    componentVersion: definition.version,
    frame: { ...DEFAULT_FRAME, ...definition.defaultFrame, ...frame },
    props,
  };
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
  return initialDataFor(type);
}

function stringMap(raw: unknown): Record<string, string> | undefined {
  if (!isRecord(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const key = k.trim();
    if (!key) continue;
    if (typeof v === "string") out[key] = v;
    else if (typeof v === "number" || typeof v === "boolean") out[key] = String(v);
  }
  return Object.keys(out).length ? out : undefined;
}

const FILTER_OPS = ["eq", "ne", "gt", "gte", "lt", "lte", "contains", "in", "notEmpty"] as const;

/** 数据源规范化：绝对地址与相对路径至少要有一个，其余字段逐项校验兜底 */
function normalizeLiveSource(raw: unknown): LiveSource | undefined {
  if (!isRecord(raw)) return undefined;
  const url = typeof raw.url === "string" ? raw.url : "";
  const path = typeof raw.path === "string" ? raw.path : "";
  if (!url.trim() && !path.trim()) return undefined;

  const headers = stringMap(raw.headers);
  const query = stringMap(raw.query);

  const filtersRaw = Array.isArray(raw.filter) ? raw.filter : undefined;
  const filter = filtersRaw
    ?.filter((f): f is Record<string, unknown> => isRecord(f))
    .map((f) => ({
      field: typeof f.field === "string" ? f.field : "",
      op: (FILTER_OPS as readonly string[]).includes(String(f.op))
        ? (String(f.op) as (typeof FILTER_OPS)[number])
        : ("eq" as const),
      value: typeof f.value === "string" ? f.value : String(f.value ?? ""),
    }))
    .filter((f) => f.field.trim() !== "");

  const select = Array.isArray(raw.select)
    ? raw.select.filter((s): s is string => typeof s === "string" && s.trim() !== "")
    : undefined;

  const sortRaw = isRecord(raw.sort) ? raw.sort : undefined;
  const sort =
    sortRaw && typeof sortRaw.field === "string" && sortRaw.field.trim()
      ? { field: sortRaw.field, ...(sortRaw.desc === true ? { desc: true } : {}) }
      : undefined;

  const limitRaw = Number(raw.limit);
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(5000, Math.max(1, Math.round(limitRaw)))
      : undefined;

  const mapRaw = isRecord(raw.map) ? raw.map : undefined;
  const map =
    mapRaw &&
    ["category", "value", "seriesField"].some(
      (k) => typeof mapRaw[k] === "string" && String(mapRaw[k]).trim() !== ""
    )
      ? {
          ...(typeof mapRaw.category === "string" && mapRaw.category.trim()
            ? { category: mapRaw.category.trim() }
            : {}),
          ...(typeof mapRaw.value === "string" && mapRaw.value.trim()
            ? { value: mapRaw.value.trim() }
            : {}),
          ...(typeof mapRaw.seriesField === "string" && mapRaw.seriesField.trim()
            ? { seriesField: mapRaw.seriesField.trim() }
            : {}),
        }
      : undefined;

  const timeoutRaw = Number(raw.timeoutMs);
  const timeoutMs =
    Number.isFinite(timeoutRaw) && timeoutRaw > 0
      ? Math.min(120000, Math.max(1000, Math.round(timeoutRaw)))
      : undefined;

  return {
    url,
    intervalSec: num(raw.intervalSec, 30),
    ...(path.trim() ? { path } : {}),
    ...(raw.method === "POST" ? { method: "POST" as const } : {}),
    ...(typeof raw.body === "string" && raw.body.trim() ? { body: raw.body } : {}),
    ...(typeof raw.dataPath === "string" && raw.dataPath.trim() ? { dataPath: raw.dataPath } : {}),
    ...(headers ? { headers } : {}),
    ...(query ? { query } : {}),
    ...(filter && filter.length ? { filter } : {}),
    ...(select && select.length ? { select } : {}),
    ...(sort ? { sort } : {}),
    ...(limit ? { limit } : {}),
    ...(map ? { map } : {}),
    ...(timeoutMs ? { timeoutMs } : {}),
  };
}

function normalizeApiSettings(raw: unknown): ApiSettings | undefined {
  if (!isRecord(raw)) return undefined;
  const baseUrl = typeof raw.baseUrl === "string" ? raw.baseUrl.trim() : "";
  const headers = stringMap(raw.headers);
  const query = stringMap(raw.query);
  const timeoutRaw = Number(raw.timeoutMs);
  const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : undefined;
  const intervalRaw = Number(raw.defaultIntervalSec);
  const defaultIntervalSec =
    Number.isFinite(intervalRaw) && intervalRaw > 0
      ? Math.min(3600, Math.max(1, Math.round(intervalRaw)))
      : undefined;
  if (
    !baseUrl &&
    !headers &&
    !query &&
    !timeoutMs &&
    !defaultIntervalSec &&
    raw.exportHeaders !== true
  ) {
    return undefined;
  }
  return {
    baseUrl,
    ...(headers ? { headers } : {}),
    ...(query ? { query } : {}),
    ...(timeoutMs ? { timeoutMs } : {}),
    ...(defaultIntervalSec ? { defaultIntervalSec } : {}),
    ...(raw.exportHeaders === true ? { exportHeaders: true } : {}),
  };
}

function normalizeSpec(raw: unknown): ChartSpec {
  const r = isRecord(raw) ? raw : {};
  const typeRaw = str(r.type, "line");
  const type = (CHART_TYPES as readonly string[]).includes(typeRaw)
    ? (typeRaw as ChartType)
    : "line";
  const option = isRecord(r.option) ? (r.option as Record<string, unknown>) : {};
  const data = normalizeData(r.data, type);
  const source = normalizeLiveSource(r.source);
  return source ? { type, option, data, source } : { type, option, data };
}

function normalizeDatasetBinding(raw: unknown): DatasetBinding | undefined {
  if (!isRecord(raw)) return undefined;
  const datasetId = str(raw.datasetId, "").trim();
  if (!datasetId) return undefined;

  let fields: DatasetBinding["fields"];
  if (isRecord(raw.fields)) {
    const normalized = {
      ...(typeof raw.fields.category === "string" && raw.fields.category.trim()
        ? { category: raw.fields.category.trim() }
        : {}),
      ...(typeof raw.fields.value === "string" && raw.fields.value.trim()
        ? { value: raw.fields.value.trim() }
        : {}),
      ...(typeof raw.fields.seriesField === "string" && raw.fields.seriesField.trim()
        ? { seriesField: raw.fields.seriesField.trim() }
        : {}),
    };
    if (Object.keys(normalized).length) fields = normalized;
  }

  let filterBy: DatasetBinding["filterBy"];
  if (isRecord(raw.filterBy)) {
    const field = str(raw.filterBy.field, "").trim();
    const globalVariable = str(raw.filterBy.globalVariable, "").trim();
    if (field && globalVariable) filterBy = { field, globalVariable };
  }
  return { datasetId, ...(fields ? { fields } : {}), ...(filterBy ? { filterBy } : {}) };
}

function normalizeItem(raw: unknown): ScreenItem | null {
  if (!isRecord(raw)) return null;
  const kind = str(raw.kind, "");
  if (kind !== "component" && !(ITEM_KINDS as readonly string[]).includes(kind)) return null;
  const base = {
    id: str(raw.id, uuid()),
    name: str(raw.name, ""),
    frame: normalizeFrame(raw.frame),
    ...(typeof raw.locked === "boolean" ? { locked: raw.locked } : {}),
    ...(typeof raw.hidden === "boolean" ? { hidden: raw.hidden } : {}),
    ...(typeof raw.opacity === "number" ? { opacity: raw.opacity } : {}),
    ...(typeof raw.groupId === "string" ? { groupId: raw.groupId } : {}),
  };
  if (kind === "component") {
    const rawVersion = raw.componentVersion;
    const componentVersion =
      typeof rawVersion === "number" && Number.isInteger(rawVersion) && rawVersion > 0
        ? rawVersion
        : 1;
    const dataBinding = normalizeDatasetBinding(raw.dataBinding);
    return {
      ...base,
      name: base.name || "组件",
      kind: "component",
      componentId: str(raw.componentId, "").trim(),
      componentVersion,
      props: isRecord(raw.props) ? { ...raw.props } : {},
      ...(dataBinding ? { dataBinding } : {}),
    } satisfies ComponentItem;
  }
  switch (kind) {
    case "chart":
      return {
        ...base,
        kind: "chart",
        spec: normalizeSpec(raw.spec),
        ...(typeof raw.sourceAssetId === "string" ? { sourceAssetId: raw.sourceAssetId } : {}),
      } satisfies ChartItem;
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
    ...(typeof raw.thumbnailVersion === "number" ? { thumbnailVersion: raw.thumbnailVersion } : {}),
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
  const api = normalizeApiSettings(settingsRaw.api);
  return {
    version: 1,
    assets: assetsRaw.map((a) => normalizeAsset(a)).filter((a): a is ChartAsset => a !== null),
    screens: screensRaw.map((s) => normalizeScreen(s)).filter((s): s is Screen => s !== null),
    settings: {
      autosave: settingsRaw.autosave !== false,
      ...(api ? { api } : {}),
    },
  };
}
