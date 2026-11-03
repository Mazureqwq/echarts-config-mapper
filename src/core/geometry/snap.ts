export interface SnapCandidate {
  axis: "x" | "y";
  moving: number;
  static: number;
}

export interface SnapGuide {
  axis: "x" | "y";
  position: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: SnapGuide[];
}

export const SNAP_THRESHOLD = 6;

export function snapDelta(
  delta: { dx: number; dy: number },
  candidates: SnapCandidate[],
  threshold: number = SNAP_THRESHOLD
): SnapResult {
  const result: SnapResult = { dx: delta.dx, dy: delta.dy, guides: [] };
  const axes: Array<{ axis: "x" | "y"; base: number }> = [
    { axis: "x", base: delta.dx },
    { axis: "y", base: delta.dy },
  ];
  for (const { axis, base } of axes) {
    let best: { correction: number; guide: SnapGuide } | null = null;
    for (const c of candidates) {
      if (c.axis !== axis) continue;
      const correction = c.static - (c.moving + base);
      if (
        Math.abs(correction) <= threshold &&
        (best === null || Math.abs(correction) < Math.abs(best.correction))
      ) {
        best = { correction, guide: { axis, position: c.static } };
      }
    }
    if (best) {
      if (axis === "x") {
        result.dx = base + best.correction;
      } else {
        result.dy = base + best.correction;
      }
      const guide = best.guide;
      if (!result.guides.some((g) => g.axis === guide.axis && g.position === guide.position)) {
        result.guides.push(guide);
      }
    }
  }
  return result;
}
