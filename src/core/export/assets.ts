import echartsUrl from "echarts/dist/echarts.min.js?url";
import chinaGeo from "@/assets/geo/china.json";
import { RUNTIME_CODE } from "./runtime";
import type { PackagePayload } from "./model";

let echartsCache: string | null = null;

/**
 * 取 ECharts UMD 源码（1.1 MB）。
 * 走 Vite 的 `?url` 资源：只在真正导出时按需 fetch，不影响应用首屏体积。
 */
export async function loadEchartsSource(): Promise<string> {
  if (echartsCache) return echartsCache;
  const res = await fetch(echartsUrl);
  if (!res.ok) throw new Error(`加载 ECharts 运行时失败（HTTP ${res.status}）`);
  echartsCache = await res.text();
  return echartsCache;
}

export function runtimeSource(): string {
  return RUNTIME_CODE;
}

/** 只有产物里存在旧地图图表或地图场景容器时才注入本地 GeoJSON，省 54 KB */
export function attachGeo(payload: PackagePayload): PackagePayload {
  const geoChartTypes = ["map", "geoScatter", "geoHeatmap", "geoFlow"];
  const mapSceneIds = ["chartforge.map-scene-flat", "chartforge.map-scene-tilted"];
  const needsGeo = payload.screens.some((s) => s.items.some((i) =>
    (i.kind === "chart" && geoChartTypes.includes(i.type)) ||
    (i.kind === "component" && mapSceneIds.includes(i.componentId) && i.componentVersion === 1)
  ));
  if (!needsGeo) return payload;
  return { ...payload, geo: { china: chinaGeo } };
}
