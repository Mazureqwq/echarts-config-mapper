import { buildRequest, clampTimeout } from "./apiSettings";
import { toRows } from "./pipeline";
import type { ApiSettings, LiveSource } from "@/core/model/types";

export type Row = Record<string, unknown>;

export interface ProbeResult {
  ok: boolean;
  status?: number;
  durationMs: number;
  /** 原始响应（JSON 解析后） */
  raw?: unknown;
  /** 请求的最终地址（相对路径已拼上 baseUrl） */
  url: string;
  method: string;
  error?: string;
}

export type ProbeFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text?: () => Promise<string> }>;

export interface ProbeOptions {
  fetchImpl?: ProbeFetch;
  now?: () => number;
}

/** 把网络层的原始异常翻译成人话（CORS 是最常见的一种） */
export function explainFetchError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (e instanceof Error && e.name === "AbortError") return "请求超时：接口在规定时间内没有返回";
  if (/Failed to fetch|NetworkError|load failed/i.test(msg)) {
    return "请求失败：可能是地址写错、服务未启动，或对方没开 CORS（浏览器跨域限制）";
  }
  if (/HTTP 401|HTTP 403/.test(msg)) return "接口拒绝访问：检查 token / 权限";
  if (/HTTP 404/.test(msg)) return "接口不存在（404）：检查路径是否写对";
  if (/HTTP 5\d\d/.test(msg)) return "服务端报错：稍后重试或联系接口提供方";
  return msg;
}

/** 根据一行数据推断「可以当列名」的键（对象里的平铺字段） */
export function inferFields(raw: unknown): { fields: string[]; rows: Row[] } {
  const rows = toProbeRows(raw);
  const fields: string[] = [];
  const seen = new Set<string>();
  for (const row of rows.slice(0, 50)) {
    for (const key of Object.keys(row)) {
      if (seen.has(key)) continue;
      seen.add(key);
      fields.push(key);
    }
  }
  return { fields, rows };
}

/** 行摊平规则与加工链共用 `pipeline.toRows`，避免调试台看到的结构和图表吃到的不一致 */
export const toProbeRows = toRows;

/**
 * 调试台：真正打一次请求，拿到状态码、耗时和响应体。
 * 与正式拉数共用 `buildRequest`，所以「这里能通」等于「图表能通」。
 */
export async function probeSource(
  source: LiveSource,
  api?: ApiSettings,
  options: ProbeOptions = {}
): Promise<ProbeResult> {
  const request = buildRequest(source, api);
  const timeoutMs = clampTimeout(source.timeoutMs ?? api?.timeoutMs);
  const doFetch: ProbeFetch = options.fetchImpl ?? (fetch as unknown as ProbeFetch);
  const now = options.now ?? (() => Date.now());
  const startedAt = now();
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  if (controller) timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await doFetch(request.url, {
      method: request.method,
      headers: request.headers,
      ...(request.body === undefined ? {} : { body: request.body }),
      ...(controller ? { signal: controller.signal } : {}),
    });
    const durationMs = Math.max(0, now() - startedAt);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        durationMs,
        url: request.url,
        method: request.method,
        error: explainFetchError(new Error(`HTTP ${res.status}`)),
      };
    }
    let raw: unknown;
    try {
      raw = await res.json();
    } catch {
      return {
        ok: false,
        status: res.status,
        durationMs,
        url: request.url,
        method: request.method,
        error: "响应不是合法 JSON：确认接口返回的是 JSON 而不是 HTML/纯文本",
      };
    }
    return { ok: true, status: res.status, durationMs, raw, url: request.url, method: request.method };
  } catch (e) {
    return {
      ok: false,
      durationMs: Math.max(0, now() - startedAt),
      url: request.url,
      method: request.method,
      error: explainFetchError(e),
    };
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}
