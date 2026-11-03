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
