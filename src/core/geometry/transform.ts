import type { Frame } from "../model/types";
import { frameCenter, rotatePoint } from "./hit";
import type { Point } from "./hit";

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const MIN_SIZE = 8;

export interface ResizeOptions {
  keepAspect?: boolean;
}

export function resizeFrame(
  frame: Frame,
  handle: Handle,
  dx: number,
  dy: number,
  opts?: ResizeOptions
): Frame {
  const { x, y, w, h } = frame;
  const west = handle === "nw" || handle === "w" || handle === "sw";
  const east = handle === "ne" || handle === "e" || handle === "se";
  const north = handle === "nw" || handle === "n" || handle === "ne";
  const south = handle === "sw" || handle === "s" || handle === "se";
  const corner = (west || east) && (north || south);

  if (corner && opts?.keepAspect && w > 0 && h > 0) {
    const ratio = w / h;
    const scaleX = (w + (east ? dx : -dx)) / w;
    const scaleY = (h + (south ? dy : -dy)) / h;
    const scale = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY;
    let nw = w * scale;
    let nh = nw / ratio;
    if (nw < MIN_SIZE) {
      nw = MIN_SIZE;
      nh = nw / ratio;
    }
    if (nh < MIN_SIZE) {
      nh = MIN_SIZE;
      nw = nh * ratio;
    }
    return {
      ...frame,
      w: nw,
      h: nh,
      x: west ? x + w - nw : x,
      y: north ? y + h - nh : y,
    };
  }

  let nx = x;
  let ny = y;
  let nw = w;
  let nh = h;
  if (east) nw = w + dx;
  if (south) nh = h + dy;
  if (west) {
    nx = x + dx;
    nw = w - dx;
  }
  if (north) {
    ny = y + dy;
    nh = h - dy;
  }
  if (nw < MIN_SIZE) {
    if (west) nx = nx + nw - MIN_SIZE;
    nw = MIN_SIZE;
  }
  if (nh < MIN_SIZE) {
    if (north) ny = ny + nh - MIN_SIZE;
    nh = MIN_SIZE;
  }
  return { ...frame, x: nx, y: ny, w: nw, h: nh };
}

export function snapResizeFrameToGrid(
  frame: Frame,
  resized: Frame,
  handle: Handle,
  gridSize: number,
  keepAspect: boolean = false
): Frame {
  if (!Number.isFinite(gridSize) || gridSize <= 0 || frame.w <= 0 || frame.h <= 0) return resized;
  const snap = (value: number): number => Math.round(value / gridSize) * gridSize;
  const west = handle === "nw" || handle === "w" || handle === "sw";
  const east = handle === "ne" || handle === "e" || handle === "se";
  const north = handle === "nw" || handle === "n" || handle === "ne";
  const south = handle === "sw" || handle === "s" || handle === "se";
  const corner = (west || east) && (north || south);

  if (corner && keepAspect) {
    const ratio = frame.w / frame.h;
    const widthDominant = Math.abs(resized.w - frame.w) >= Math.abs(resized.h - frame.h);
    let w: number;
    let h: number;
    if (widthDominant) {
      const anchorX = west ? frame.x + frame.w : frame.x;
      const movingX = snap(west ? resized.x : resized.x + resized.w);
      w = Math.max(MIN_SIZE, west ? anchorX - movingX : movingX - anchorX);
      h = w / ratio;
      if (h < MIN_SIZE) {
        h = MIN_SIZE;
        w = h * ratio;
      }
    } else {
      const anchorY = north ? frame.y + frame.h : frame.y;
      const movingY = snap(north ? resized.y : resized.y + resized.h);
      h = Math.max(MIN_SIZE, north ? anchorY - movingY : movingY - anchorY);
      w = h * ratio;
      if (w < MIN_SIZE) {
        w = MIN_SIZE;
        h = w / ratio;
      }
    }
    return {
      ...resized,
      x: west ? frame.x + frame.w - w : frame.x,
      y: north ? frame.y + frame.h - h : frame.y,
      w,
      h,
    };
  }

  let { x, y, w, h } = resized;
  if (east) w = Math.max(MIN_SIZE, snap(frame.x + resized.w) - frame.x);
  if (west) {
    const right = frame.x + frame.w;
    x = Math.min(snap(resized.x), right - MIN_SIZE);
    w = right - x;
  }
  if (south) h = Math.max(MIN_SIZE, snap(frame.y + resized.h) - frame.y);
  if (north) {
    const bottom = frame.y + frame.h;
    y = Math.min(snap(resized.y), bottom - MIN_SIZE);
    h = bottom - y;
  }
  return { ...resized, x, y, w, h };
}

export interface RotateOptions {
  snap?: boolean;
}

export const ROTATE_SNAP_STEP = 15;

function normalizeAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

export function rotateFrame(
  frame: Frame,
  pivot: Point,
  angle: number,
  opts?: RotateOptions
): Frame {
  let target = normalizeAngle(angle);
  if (opts?.snap) {
    target = normalizeAngle(Math.round(target / ROTATE_SNAP_STEP) * ROTATE_SNAP_STEP);
  }
  const c = frameCenter(frame);
  const nc = rotatePoint(c, pivot, target - frame.rotate);
  return {
    ...frame,
    x: nc.x - frame.w / 2,
    y: nc.y - frame.h / 2,
    rotate: target,
  };
}
