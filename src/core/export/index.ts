import { buildPackagePayload } from "./snapshot";
import { buildArtifact } from "./artifact";
import { attachGeo, loadEchartsSource, loadMaplibreSource, runtimeSource } from "./assets";
import { createZip, filesToEntries } from "./zip";
import type { ArtifactMode, ExportOptions } from "./model";
import type { Workspace } from "@/core/model/types";

export interface ExportPackageResult {
  /** 建议的下载文件名 */
  fileName: string;
  blob: Blob;
  bytes: number;
  warnings: string[];
}

export interface ExportPackageParams {
  workspace: Workspace;
  screenIds: string[];
  mode: ArtifactMode;
  options?: ExportOptions;
}

function toBlob(files: Array<{ path: string; content: string }>, mode: ArtifactMode): Promise<Blob> {
  if (mode === "inline") {
    const html = files.find((f) => f.path === "index.html");
    return Promise.resolve(new Blob([html?.content ?? ""], { type: "text/html;charset=utf-8" }));
  }
  return createZip(filesToEntries(files)).then(
    (bytes) =>
      new Blob([bytes as unknown as BlobPart], { type: "application/zip" })
  );
}

/**
 * 导出大屏产物：快照 → 转义/CSP/清单 → 单文件 HTML 或 zip。
 * 所有安全处理都在 `buildPackagePayload` + `buildArtifact` 里，这里只负责下载形态。
 */
export async function exportScreenPackage(params: ExportPackageParams): Promise<ExportPackageResult> {
  const payload = attachGeo(
    buildPackagePayload(params.workspace, params.screenIds, params.options)
  );
  const artifact = await buildArtifact({
    payload,
    echartsCode: await loadEchartsSource(),
    maplibreCode: await loadMaplibreSource(),
    runtimeCode: runtimeSource(),
    mode: params.mode,
  });
  const blob = await toBlob(artifact.files, params.mode);
  return {
    fileName: `${artifact.baseName}.${params.mode === "inline" ? "screen.html" : "screen-package.zip"}`,
    blob,
    bytes: blob.size,
    warnings: artifact.manifest.warnings,
  };
}

export { buildPackagePayload } from "./snapshot";
export { buildArtifact } from "./artifact";
export { createZip, crc32 } from "./zip";
export type {
  ArtifactMode, ExportOptions, PackageChartItem, PackageComponentItem, PackageDataset, PackageItem, PackagePayload, PackageScreen,
} from "./model";
