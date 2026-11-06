import type { ApiSettings, LiveSource } from "@/core/model/types";

export const DEFAULT_TIMEOUT_MS = 10000;
export const MIN_TIMEOUT_MS = 1000;
export const MAX_TIMEOUT_MS = 120000;

export type HttpMethod = "GET" | "POST";

/** 一次真实请求的完整描述（由 source + 全局设置合成） */
export interface HttpRequest {
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  body?: string;
}

export function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

/** 拼接 baseUrl 与相对路径：去重复斜杠；path 自带协议则原样直通 */
export function joinUrl(baseUrl: string | undefined, path: string): string {
  const p = (path ?? "").trim();
  if (!p) return (baseUrl ?? "").trim();
  if (isAbsoluteUrl(p)) return p;
  const base = (baseUrl ?? "").trim();
  if (!base) return p;
  const left = base.replace(/\/+$/, "");
  const right = p.startsWith("/") ? p : `/${p}`;
  return `${left}${right}`;
}

export function clampTimeout(ms: unknown): number {
  const n = Number(ms);
  if (!Number.isFinite(n)) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, Math.round(n)));
}

function mergeMap(
  global: Record<string, string> | undefined,
  local: Record<string, string> | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(global ?? {})) {
    const key = k.trim();
    if (key) out[key] = String(v);
  }
  // 局部配置覆盖全局同名项
  for (const [k, v] of Object.entries(local ?? {})) {
    const key = k.trim();
    if (key) out[key] = String(v);
  }
  return out;
}

/** query 参数拼到 url 上（已存在的同名参数以局部为准） */
export function appendQuery(url: string, query: Record<string, string>): string {
  const entries = Object.entries(query).filter(([k]) => k.trim() !== "");
  if (!entries.length) return url;
  const [beforeHash, hash = ""] = url.split("#");
  const [pathPart, search = ""] = beforeHash.split("?");
  const params = new URLSearchParams(search);
  for (const [k, v] of entries) params.set(k.trim(), v);
  // 参数顺序归一：URL 更稳定，也让「同参数不同书写顺序」共用同一个请求
  params.sort();
  const qs = params.toString();
  return `${pathPart}${qs ? `?${qs}` : ""}${hash ? `#${hash}` : ""}`;
}

/**
 * 合成一次请求：baseUrl + 相对路径 → 绝对地址；
 * 全局 header/query 与图表级配置合并（图表级优先）。
 */
export function buildRequest(source: LiveSource, api?: ApiSettings): HttpRequest {
  const absolute = (source.url ?? "").trim();
  const path = (source.path ?? "").trim();
  const url = absolute
    ? appendQuery(absolute, { ...(api?.query ?? {}), ...(source.query ?? {}) })
    : appendQuery(joinUrl(api?.baseUrl, path), { ...(api?.query ?? {}), ...(source.query ?? {}) });

  const method: HttpMethod = source.method === "POST" ? "POST" : "GET";
  const headers = mergeMap(api?.headers, source.headers);
  const body = method === "POST" && source.body ? source.body : undefined;
  if (body && !Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) {
    headers["Content-Type"] = "application/json";
  }
  return { url, method, headers, ...(body ? { body } : {}) };
}

/** 合并键：同一份「方法 + 参数 + body」才共用一个请求 */
export function feedKey(req: HttpRequest): string {
  const headerPart = Object.entries(req.headers)
    .map(([k, v]) => [k.toLowerCase(), v] as const)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
  return `${req.method} ${req.url} #${headerPart} #${req.body ?? ""}`;
}

/** "a=1\nb = 2" → { a: "1", b: "2" }：设置页用多行文本编辑键值对 */
export function parsePairs(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      out[trimmed] = "";
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    if (!key) continue;
    out[key] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

export function formatPairs(map: Record<string, string> | undefined): string {
  return Object.entries(map ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

/** 只把相对路径显示成预览（设置页与面板共用） */
export function previewUrl(path: string, api?: ApiSettings): string {
  return joinUrl(api?.baseUrl, path);
}
