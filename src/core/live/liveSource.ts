import type { LiveSource } from "@/core/model/types";
import { resolveDataPath } from "./dataPath";

/** 轮询间隔下限（与 LiveExecutor 保持一致） */
export const LIVE_MIN_INTERVAL_SEC = 5;
export const LIVE_MAX_INTERVAL_SEC = 3600;

export interface LiveSourceInput {
  url: string;
  intervalSec: number;
  dataPath?: string;
}

export type LiveSourceResult =
  | { ok: true; source: LiveSource }
  | { ok: false; message: string };

/** 只放行 http / https / 站内相对路径，挡掉 javascript: 之类的伪协议 */
export function isAllowedUrl(url: string): boolean {
  const value = url.trim();
  if (!value) return false;
  if (value.startsWith("/")) return true;
  return /^https?:\/\//i.test(value);
}

/**
 * 校验并归一化实时数据源配置。
 * 间隔抬到 [5, 3600]，dataPath 去空格（空则不带），非法地址返回可读中文提示。
 */
export function validateLiveSource(input: LiveSourceInput): LiveSourceResult {
  const url = String(input.url ?? "").trim();
  if (!url) return { ok: false, message: "请填写接口地址" };
  if (!isAllowedUrl(url)) {
    return { ok: false, message: "接口地址需以 http:// 、https:// 或 / 开头" };
  }

  const raw = Number(input.intervalSec);
  const intervalSec = Number.isFinite(raw)
    ? Math.min(LIVE_MAX_INTERVAL_SEC, Math.max(LIVE_MIN_INTERVAL_SEC, Math.round(raw)))
    : LIVE_MIN_INTERVAL_SEC * 6;

  const dataPath = String(input.dataPath ?? "").trim();
  const source: LiveSource = {
    url,
    intervalSec,
    ...(dataPath ? { dataPath } : {}),
  };
  return { ok: true, source };
}

/** 给人看的载荷摘要：数组 12 项 / 对象 3 个字段 / 字符串等 */
export function describePayload(data: unknown): string {
  if (data === null || data === undefined) return "空数据（null）";
  if (Array.isArray(data)) {
    const head = data[0];
    const shape = Array.isArray(head)
      ? "二维表"
      : head && typeof head === "object"
        ? "对象数组"
        : "数组";
    return `${shape}，共 ${data.length} 项`;
  }
  if (typeof data === "object") {
    const keys = Object.keys(data as Record<string, unknown>);
    const shown = keys.slice(0, 4).join("、");
    return `对象，${keys.length} 个字段：${shown}${keys.length > 4 ? " …" : ""}`;
  }
  return `字符串/数值：${String(data).slice(0, 40)}`;
}

export interface ProbeResult {
  ok: boolean;
  preview?: string;
  error?: string;
  /** 取到的原始数据（成功时） */
  data?: unknown;
}

/**
 * 试拉一次数据，供「测试连接」使用。
 * fetchImpl 可注入；默认用真实 fetch，非 2xx 会转成 "HTTP 404" 这种可读错误。
 */
export async function probeLiveSource(
  source: LiveSourceInput,
  fetchImpl?: (url: string) => Promise<unknown>
): Promise<ProbeResult> {
  const checked = validateLiveSource(source);
  if (!checked.ok) return { ok: false, error: checked.message };

  const doFetch =
    fetchImpl ??
    (async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    });

  try {
    const raw = await doFetch(checked.source.url);
    const data = resolveDataPath(raw, checked.source.dataPath);
    if (data === undefined) {
      return {
        ok: false,
        error: checked.source.dataPath
          ? `dataPath「${checked.source.dataPath}」在返回结果里取不到值`
          : "接口返回空数据",
      };
    }
    return { ok: true, data, preview: describePayload(data) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
