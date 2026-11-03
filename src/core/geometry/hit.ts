import type { Frame, ScreenItem } from "../model/types";

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function frameCenter(frame: Frame): Point {
  return { x: frame.x + frame.w / 2, y: frame.y + frame.h / 2 };
}

export function rotatePoint(p: Point, center: Point, deg: number): Point {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

export function hitTest(item: ScreenItem, pt: Point): boolean {
  const f = item.frame;
  const c = frameCenter(f);
  const local = rotatePoint(pt, c, -f.rotate);
  return (
    local.x >= f.x &&
    local.x <= f.x + f.w &&
    local.y >= f.y &&
    local.y <= f.y + f.h
  );
}

export function frameCorners(frame: Frame): Point[] {
  const c = frameCenter(frame);
  const corners: Point[] = [
    { x: frame.x, y: frame.y },
    { x: frame.x + frame.w, y: frame.y },
    { x: frame.x + frame.w, y: frame.y + frame.h },
    { x: frame.x, y: frame.y + frame.h },
  ];
  return frame.rotate === 0 ? corners : corners.map((p) => rotatePoint(p, c, frame.rotate));
}

function overlapAxes(corners: Point[], rect: Rect): boolean {
  const rectCorners: Point[] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h },
  ];
  const axes: Point[] = [{ x: 1, y: 0 }, { x: 0, y: 1 }];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    const edge = { x: b.x - a.x, y: b.y - a.y };
    axes.push({ x: -edge.y, y: edge.x });
  }
  for (const axis of axes) {
    const p1 = corners.map((p) => p.x * axis.x + p.y * axis.y);
    const p2 = rectCorners.map((p) => p.x * axis.x + p.y * axis.y);
    if (Math.max(...p1) < Math.min(...p2) || Math.max(...p2) < Math.min(...p1)) {
      return false;
    }
  }
  return true;
}

export function boxSelect(items: ScreenItem[], rect: Rect): ScreenItem[] {
  return items.filter((it) => overlapAxes(frameCorners(it.frame), rect));
}
