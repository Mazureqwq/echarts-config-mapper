import { ImportError, StorageQuotaError } from "../model/errors";
import { migrate } from "../model/migrate";
import { createWorkspace, normalizeWorkspace } from "../model/schema";
import type { ChartAsset, Screen, Workspace } from "../model/types";

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
  if ("version" in target && (target as Workspace).version === 1 && "settings" in target) {
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

export function exportJson(target: ExportTarget): string {
  const envelope: Envelope = {
    format: "chartforge/v1",
    kind: targetKind(target),
    payload: target,
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
  return {
    ...ws,
    assets: ws.assets.map((a) => ({ ...a, id: newId() })),
    screens: ws.screens.map((s) => ({
      ...s,
      id: newId(),
      items: s.items.map((it) => ({ ...it, id: newId() })),
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
    version: 1,
    assets: [...current.assets, ...merged.assets],
    screens: [...current.screens, ...merged.screens],
    settings: { ...current.settings },
  };
  saveWorkspace(result);
  return result;
}
