/** 图表资产拖拽载荷 MIME（图表库 → 大屏画布） */
export const ASSET_DND_MIME = "application/x-chartforge-asset";
/** Design library components, blocks and workspace image assets → canvas. */
export const DESIGN_DND_MIME = "application/x-chartforge-design";

export interface ActiveCanvasDragPayload {
  mime: string;
  data: string;
}

let activeCanvasDragPayload: ActiveCanvasDragPayload | null = null;

export function setActiveCanvasDragPayload(mime: string, data: string): void {
  activeCanvasDragPayload = { mime, data };
}

export function getActiveCanvasDragPayload(): ActiveCanvasDragPayload | null {
  return activeCanvasDragPayload;
}

export function clearActiveCanvasDragPayload(): void {
  activeCanvasDragPayload = null;
}
