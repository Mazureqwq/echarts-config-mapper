import { ImportError, StorageQuotaError } from "../model/errors";
import { migrate } from "../model/migrate";
import { createWorkspace, normalizeWorkspace } from "../model/schema";
import type { ChartAsset, Screen, ScreenItem, Workspace } from "../model/types";

export const STORAGE_KEY = "chartforge.workspace.v1";

type ExportTarget = Workspace | Screen | ChartAsset;
type TargetKind = "workspace" | "screen" | "asset";

interface Envelope {
  format: "chartforge/v1";
  kind: TargetKind;
  payload: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function targetKind(target: ExportTarget): TargetKind {
  if ("version" in target && (target as Workspace).version === 2 && "settings" in target) {
    return "workspace";
  }
  if ("spec" in target && "createdAt" in target) {
    return "asset";
  }
  return "screen";
}

export function loadWorkspace(): Workspace {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return createWorkspace();
  try {
    return migrate(JSON.parse(raw));
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError("本地存储中的工作区数据已损坏");
  }
}

export function saveWorkspace(ws: Workspace): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ws));
  } catch {
    throw new StorageQuotaError("保存失败：本地存储空间不足或不可用");
  }
}

export const SECRET_MASK = "***";

function maskHeaders(headers: unknown): unknown {
  if (!isRecord(headers)) return headers;
  const out: Record<string, string> = {};
  for (const key of Object.keys(headers)) out[key] = SECRET_MASK;
  return out;
}

function scrubSpec(spec: unknown): unknown {
  if (!isRecord(spec)) return spec;
  const source = spec.source;
  if (!isRecord(source) || !isRecord(source.headers)) return spec;
  return { ...spec, source: { ...source, headers: maskHeaders(source.headers) } };
}

/**
 * 导出前的脱敏：请求头里的 token 是明文存在 localStorage 的，
 * 导出的 JSON 常常被贴进 issue / 聊天窗口，所以默认把 header 值替换成 ***，
 * 只在用户显式打开 exportHeaders 时才原样导出。
 * 返回新对象，绝不修改内存里的工作区。
 */
export function scrubSecrets(target: ExportTarget): ExportTarget {
  if (targetKind(target) === "workspace") {
    const ws = target as Workspace;
    const keep = ws.settings?.api?.exportHeaders === true;
    if (keep) return target;
    const api = ws.settings?.api;
    return {
      ...ws,
      assets: ws.assets.map((a) => ({ ...a, spec: scrubSpec(a.spec) as typeof a.spec })),
      screens: ws.screens.map((s) => ({
        ...s,
        items: s.items.map((it) =>
          it.kind === "chart" ? { ...it, spec: scrubSpec(it.spec) as typeof it.spec } : it
        ),
      })),
      datasets: ws.datasets.map((dataset) =>
        dataset.source.kind === "http" && dataset.source.live.headers
          ? {
              ...dataset,
              source: {
                ...dataset.source,
                live: {
                  ...dataset.source.live,
                  headers: maskHeaders(dataset.source.live.headers) as Record<string, string>,
                },
              },
            }
          : dataset
      ),
      settings: {
        ...ws.settings,
        ...(api ? { api: { ...api, ...(api.headers ? { headers: maskHeaders(api.headers) as Record<string, string> } : {}) } } : {}),
      },
    };
  }
  if (targetKind(target) === "asset") {
    const asset = target as ChartAsset;
    return { ...asset, spec: scrubSpec(asset.spec) as ChartAsset["spec"] };
  }
  const screen = target as Screen;
  return {
    ...screen,
    items: screen.items.map((it) =>
      it.kind === "chart" ? { ...it, spec: scrubSpec(it.spec) as typeof it.spec } : it
    ),
  };
}

export function exportJson(target: ExportTarget): string {
  const envelope: Envelope = {
    format: "chartforge/v1",
    kind: targetKind(target),
    payload: scrubSecrets(target),
  };
  return JSON.stringify(envelope, null, 2);
}

function detectKind(raw: unknown): TargetKind {
  if (!isRecord(raw)) throw new ImportError("无法识别的导入内容");
  if ("version" in raw) return "workspace";
  if ("spec" in raw && "createdAt" in raw) return "asset";
  if ("items" in raw || "canvas" in raw) return "screen";
  throw new ImportError("无法识别的导入内容");
}

function freshIds(ws: Workspace): Workspace {
  const datasetIds = new Map(ws.datasets.map((dataset) => [dataset.id, newId()]));
  return {
    ...ws,
    assets: ws.assets.map((a) => ({ ...a, id: newId() })),
    datasets: ws.datasets.map((dataset) => ({ ...dataset, id: datasetIds.get(dataset.id)! })),
    screens: ws.screens.map((s) => ({
      ...s,
      id: newId(),
      items: s.items.map((it): ScreenItem => {
        const next = { ...it, id: newId() };
        if (next.kind === "component" && next.dataBinding) {
          const datasetId = datasetIds.get(next.dataBinding.datasetId);
          if (datasetId) next.dataBinding = { ...next.dataBinding, datasetId };
        }
        return next;
      }),
    })),
  };
}

export function importJson(text: string, mode: "merge" | "replace"): Workspace {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ImportError("不是有效的 JSON");
  }

  let kind: TargetKind;
  let payload: unknown = parsed;
  if (isRecord(parsed) && parsed.format === "chartforge/v1") {
    kind = detectKind(parsed.payload);
    payload = parsed.payload;
  } else {
    kind = detectKind(parsed);
  }

  let incoming: Workspace;
  if (kind === "workspace") {
    incoming = migrate(payload);
  } else if (kind === "screen") {
    const wrapped = normalizeWorkspace({ version: 1, screens: [payload] });
    incoming = { ...createWorkspace(), screens: wrapped.screens };
  } else {
    const wrapped = normalizeWorkspace({ version: 1, assets: [payload] });
    incoming = { ...createWorkspace(), assets: wrapped.assets };
  }

  const current = mode === "merge" ? loadWorkspace() : createWorkspace();
  const merged = freshIds(incoming);
  const result: Workspace = {
    version: 2,
    assets: [...current.assets, ...merged.assets],
    screens: [...current.screens, ...merged.screens],
    datasets: [...current.datasets, ...merged.datasets],
    settings: { ...current.settings },
  };
  saveWorkspace(result);
  return result;
}
